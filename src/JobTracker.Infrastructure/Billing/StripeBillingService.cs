using System.Globalization;
using System.Text.Json;
using JobTracker.Application.Authentication;
using JobTracker.Application.Membership;
using JobTracker.Infrastructure.Identity;
using JobTracker.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Stripe;
using Stripe.BillingPortal;
using Stripe.Checkout;

namespace JobTracker.Infrastructure.Billing;

internal sealed class StripeBillingService(
    IOptions<StripeBillingOptions> options,
    JobTrackerDbContext dbContext,
    ICurrentUser currentUser,
    IHostEnvironment hostEnvironment,
    ILogger<StripeBillingService> logger) : IBillingService
{
    private readonly StripeBillingOptions _options = options.Value;

    public bool IsConfigured => _options.IsComplete;

    public async Task<BillingRedirectDto> CreateCheckoutSessionAsync(
        BillingCycle billingCycle,
        Guid checkoutRequestId,
        CancellationToken cancellationToken = default)
    {
        EnsureConfigured();
        if (checkoutRequestId == Guid.Empty)
        {
            throw new BillingException("A valid Checkout request ID is required.", 400);
        }

        var user = await GetCurrentUserAsync(cancellationToken);
        if (IsPaidMembership(user.MembershipPlan, user.MembershipStatus))
        {
            throw new BillingException(
                "This account already has an active membership. Open the billing portal to change or cancel it.",
                409);
        }

        var priceId = billingCycle == BillingCycle.Annual
            ? _options.AnnualPriceId
            : _options.MonthlyPriceId;
        var metadata = new Dictionary<string, string>
        {
            ["jobflow_user_id"] = user.Id.ToString("D"),
            ["jobflow_plan"] = MembershipPlanCatalog.FoundingPlanId,
            ["jobflow_billing_cycle"] = billingCycle.ToString(),
            ["jobflow_price_id"] = priceId
        };
        var createOptions = new Stripe.Checkout.SessionCreateOptions
        {
            Mode = "subscription",
            SuccessUrl = _options.SuccessUrl,
            CancelUrl = _options.CancelUrl,
            ClientReferenceId = user.Id.ToString("D"),
            AllowPromotionCodes = true,
            LineItems =
            [
                new Stripe.Checkout.SessionLineItemOptions
                {
                    Price = priceId,
                    Quantity = 1
                }
            ],
            Metadata = metadata,
            SubscriptionData = new Stripe.Checkout.SessionSubscriptionDataOptions
            {
                Metadata = metadata
            }
        };

        if (string.IsNullOrWhiteSpace(user.StripeCustomerId))
        {
            createOptions.CustomerEmail = user.Email;
        }
        else
        {
            createOptions.Customer = user.StripeCustomerId;
        }

        try
        {
            var stripeClient = new StripeClient(_options.SecretKey);
            await ValidateConfiguredPriceAsync(
                stripeClient,
                priceId,
                billingCycle,
                cancellationToken);
            var service = new Stripe.Checkout.SessionService(stripeClient);
            var session = await service.CreateAsync(
                createOptions,
                new RequestOptions
                {
                    IdempotencyKey = $"jobflow-checkout-{user.Id:N}-{checkoutRequestId:N}"
                },
                cancellationToken: cancellationToken);
            if (string.IsNullOrWhiteSpace(session.Url))
            {
                throw new BillingException("Stripe did not return a checkout URL.", 502);
            }

            return new BillingRedirectDto(session.Url);
        }
        catch (StripeException exception)
        {
            var stripeErrorCode = exception.StripeError?.Code
                ?? exception.StripeError?.Type
                ?? "stripe_error";
            var stripeParameter = exception.StripeError?.Param;
            logger.LogError(
                exception,
                "Stripe Checkout rejected the {BillingCycle} request. Code: {StripeErrorCode}; Parameter: {StripeParameter}",
                billingCycle,
                stripeErrorCode,
                stripeParameter ?? "not supplied");

            var detail = "Stripe Checkout could not be started. Verify the Stripe price and API key configuration.";
            if (hostEnvironment.IsDevelopment() &&
                !string.IsNullOrWhiteSpace(exception.StripeError?.Message))
            {
                var parameterDetail = string.IsNullOrWhiteSpace(stripeParameter)
                    ? string.Empty
                    : $" Parameter: {stripeParameter}.";
                detail = $"Stripe rejected Checkout ({stripeErrorCode}).{parameterDetail} {exception.StripeError.Message}";
            }

            throw new BillingException(
                detail,
                502,
                exception);
        }
    }

    public async Task<BillingRedirectDto> CreateCustomerPortalSessionAsync(
        CancellationToken cancellationToken = default)
    {
        EnsureConfigured();
        var user = await GetCurrentUserAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(user.StripeCustomerId))
        {
            throw new BillingException(
                "This account does not have Stripe billing details yet.",
                409);
        }

        try
        {
            var service = new Stripe.BillingPortal.SessionService(
                new StripeClient(_options.SecretKey));
            var session = await service.CreateAsync(
                new Stripe.BillingPortal.SessionCreateOptions
                {
                    Customer = user.StripeCustomerId,
                    ReturnUrl = _options.PortalReturnUrl
                },
                cancellationToken: cancellationToken);
            if (string.IsNullOrWhiteSpace(session.Url))
            {
                throw new BillingException("Stripe did not return a billing portal URL.", 502);
            }

            return new BillingRedirectDto(session.Url);
        }
        catch (StripeException exception)
        {
            throw new BillingException(
                "The Stripe billing portal could not be opened.",
                502,
                exception);
        }
    }

    public async Task CancelSubscriptionAtPeriodEndAsync(
        CancellationToken cancellationToken = default)
    {
        EnsureConfigured();
        var user = await GetCurrentUserAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(user.StripeSubscriptionId) ||
            !IsPaidMembership(user.MembershipPlan, user.MembershipStatus))
        {
            throw new BillingException(
                "This account does not have an active subscription to cancel.",
                409);
        }

        if (user.MembershipStatus.Equals("Canceling", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        try
        {
            var service = new Stripe.SubscriptionService(
                new StripeClient(_options.SecretKey));
            await service.UpdateAsync(
                user.StripeSubscriptionId,
                new Stripe.SubscriptionUpdateOptions
                {
                    CancelAtPeriodEnd = true
                },
                cancellationToken: cancellationToken);

            // Persist immediately so the UI does not depend on webhook delivery latency.
            // The signed subscription.updated webhook remains the source of truth.
            user.MembershipStatus = "Canceling";
            user.UpdatedAt = DateTimeOffset.UtcNow;
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (StripeException exception)
        {
            logger.LogError(
                exception,
                "Stripe could not schedule cancellation for subscription {SubscriptionId}.",
                user.StripeSubscriptionId);
            throw new BillingException(
                "Stripe could not schedule the membership cancellation. Please try again.",
                502,
                exception);
        }
    }

    public async Task ProcessWebhookAsync(
        string payload,
        string signature,
        CancellationToken cancellationToken = default)
    {
        EnsureConfigured();
        if (string.IsNullOrWhiteSpace(payload) || string.IsNullOrWhiteSpace(signature))
        {
            throw new BillingException("The Stripe webhook payload or signature is missing.", 400);
        }

        Event stripeEvent;
        try
        {
            stripeEvent = EventUtility.ConstructEvent(
                payload,
                signature,
                _options.WebhookSecret,
                throwOnApiVersionMismatch: false);
        }
        catch (StripeException exception)
        {
            throw new BillingException("The Stripe webhook signature is invalid.", 400, exception);
        }

        using var document = JsonDocument.Parse(payload);
        var root = document.RootElement;
        var eventType = root.GetProperty("type").GetString() ?? string.Empty;
        var eventId = root.GetProperty("id").GetString() ?? stripeEvent.Id;
        var eventCreatedAt = DateTimeOffset.FromUnixTimeSeconds(
            root.GetProperty("created").GetInt64());
        var stripeObject = root.GetProperty("data").GetProperty("object");

        if (eventType == "checkout.session.completed")
        {
            await LinkCheckoutSessionAsync(
                stripeObject,
                eventId,
                eventCreatedAt,
                cancellationToken);
            return;
        }

        if (eventType is "customer.subscription.created" or
            "customer.subscription.updated" or
            "customer.subscription.deleted")
        {
            await ApplySubscriptionEventAsync(
                stripeObject,
                eventId,
                eventCreatedAt,
                cancellationToken);
        }
    }

    private async Task LinkCheckoutSessionAsync(
        JsonElement session,
        string eventId,
        DateTimeOffset eventCreatedAt,
        CancellationToken cancellationToken)
    {
        var userIdText = ReadString(session, "client_reference_id") ??
            ReadMetadata(session, "jobflow_user_id");
        if (!Guid.TryParse(userIdText, out var userId))
        {
            throw new BillingException(
                "The completed Checkout Session is missing its Rolevya user reference.",
                400);
        }

        var user = await dbContext.Users.SingleOrDefaultAsync(
            candidate => candidate.Id == userId,
            cancellationToken)
            ?? throw new BillingException("The Checkout user no longer exists.", 404);
        if (ShouldIgnore(user, eventId, eventCreatedAt))
        {
            return;
        }

        user.StripeCustomerId = ReadString(session, "customer") ?? user.StripeCustomerId;
        user.StripeSubscriptionId = ReadString(session, "subscription") ?? user.StripeSubscriptionId;
        user.StripePriceId = ReadMetadata(session, "jobflow_price_id") ?? user.StripePriceId;
        RecordEvent(user, eventId, eventCreatedAt);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task ApplySubscriptionEventAsync(
        JsonElement subscription,
        string eventId,
        DateTimeOffset eventCreatedAt,
        CancellationToken cancellationToken)
    {
        var customerId = ReadString(subscription, "customer");
        var subscriptionId = ReadString(subscription, "id");
        var userIdText = ReadMetadata(subscription, "jobflow_user_id");
        AppUser? user = null;
        if (Guid.TryParse(userIdText, out var userId))
        {
            user = await dbContext.Users.SingleOrDefaultAsync(
                candidate => candidate.Id == userId,
                cancellationToken);
        }

        if (user is null && !string.IsNullOrWhiteSpace(customerId))
        {
            user = await dbContext.Users.SingleOrDefaultAsync(
                candidate => candidate.StripeCustomerId == customerId,
                cancellationToken);
        }

        if (user is null && !string.IsNullOrWhiteSpace(subscriptionId))
        {
            user = await dbContext.Users.SingleOrDefaultAsync(
                candidate => candidate.StripeSubscriptionId == subscriptionId,
                cancellationToken);
        }

        if (user is null)
        {
            throw new BillingException(
                "The Stripe subscription could not be matched to a Rolevya account.",
                404);
        }

        if (ShouldIgnore(user, eventId, eventCreatedAt))
        {
            return;
        }

        var status = ReadString(subscription, "status") ?? "unknown";
        var priceId = ReadSubscriptionPriceId(subscription);
        var hasRecognizedPrice = priceId == _options.MonthlyPriceId || priceId == _options.AnnualPriceId;
        var hasPaidAccess = hasRecognizedPrice && status is "active" or "trialing";

        user.StripeCustomerId = customerId ?? user.StripeCustomerId;
        user.StripeSubscriptionId = subscriptionId ?? user.StripeSubscriptionId;
        user.StripePriceId = priceId ?? user.StripePriceId;
        user.MembershipPlan = hasPaidAccess
            ? MembershipPlanCatalog.FoundingPlanId
            : MembershipPlanCatalog.FreePlanId;
        var cancelsAtPeriodEnd = ReadBoolean(subscription, "cancel_at_period_end");
        user.MembershipStatus = hasPaidAccess && cancelsAtPeriodEnd
            ? "Canceling"
            : ToMembershipStatus(status);
        user.MembershipStartedAt = hasPaidAccess
            ? user.MembershipStartedAt ?? eventCreatedAt
            : user.MembershipStartedAt;
        user.MembershipRenewsAt = hasPaidAccess
            ? ReadPeriodEnd(subscription)
            : null;
        RecordEvent(user, eventId, eventCreatedAt);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task<AppUser> GetCurrentUserAsync(CancellationToken cancellationToken) =>
        await dbContext.Users.SingleOrDefaultAsync(
            user => user.Id == currentUser.UserId,
            cancellationToken)
        ?? throw new BillingException("The signed-in user account was not found.", 404);

    private static async Task ValidateConfiguredPriceAsync(
        IStripeClient stripeClient,
        string priceId,
        BillingCycle billingCycle,
        CancellationToken cancellationToken)
    {
        // Stripe stores USD amounts in cents: $8.00 = 800 and $80.00 = 8,000.
        var expectedAmount = billingCycle == BillingCycle.Annual ? 8_000L : 800L;
        var expectedInterval = billingCycle == BillingCycle.Annual ? "year" : "month";
        var price = await new PriceService(stripeClient).GetAsync(
            priceId,
            cancellationToken: cancellationToken);
        if (!price.Active ||
            !string.Equals(price.Currency, "usd", StringComparison.OrdinalIgnoreCase) ||
            price.UnitAmount != expectedAmount ||
            price.Recurring is null ||
            !string.Equals(price.Recurring.Interval, expectedInterval, StringComparison.OrdinalIgnoreCase) ||
            price.Recurring.IntervalCount != 1)
        {
            throw new BillingException(
                billingCycle == BillingCycle.Annual
                    ? "The annual Stripe Price must be an active $80 USD yearly recurring price."
                    : "The monthly Stripe Price must be an active $8 USD monthly recurring price.",
                503);
        }
    }

    private void EnsureConfigured()
    {
        if (!IsConfigured)
        {
            throw new BillingException(
                "Stripe billing is not configured. Add the API key, webhook secret, both Price IDs, and redirect URLs.",
                503);
        }
    }

    private static bool ShouldIgnore(
        AppUser user,
        string eventId,
        DateTimeOffset eventCreatedAt) =>
        user.StripeLastEventId == eventId ||
        user.StripeLastEventCreatedAt > eventCreatedAt;

    private static void RecordEvent(
        AppUser user,
        string eventId,
        DateTimeOffset eventCreatedAt)
    {
        user.StripeLastEventId = eventId;
        user.StripeLastEventCreatedAt = eventCreatedAt;
        user.UpdatedAt = DateTimeOffset.UtcNow;
    }

    private static bool IsPaidMembership(string plan, string status) =>
        plan is MembershipPlanCatalog.FoundingPlanId or MembershipPlanCatalog.StandardPlanId &&
        (status.Equals("Active", StringComparison.OrdinalIgnoreCase) ||
         status.Equals("Trialing", StringComparison.OrdinalIgnoreCase) ||
         status.Equals("Canceling", StringComparison.OrdinalIgnoreCase));

    private static string ToMembershipStatus(string stripeStatus) => stripeStatus switch
    {
        "active" => "Active",
        "trialing" => "Trialing",
        "past_due" => "PastDue",
        "unpaid" => "Unpaid",
        "paused" => "Paused",
        "canceled" => "Canceled",
        "incomplete" => "Incomplete",
        "incomplete_expired" => "Expired",
        _ => CultureInfo.InvariantCulture.TextInfo.ToTitleCase(stripeStatus.Replace('_', ' '))
    };

    private static string? ReadString(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property) ||
            property.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return null;
        }

        return property.ValueKind == JsonValueKind.String
            ? property.GetString()
            : property.ToString();
    }

    private static bool ReadBoolean(JsonElement element, string propertyName) =>
        element.TryGetProperty(propertyName, out var property) &&
        property.ValueKind == JsonValueKind.True;

    private static string? ReadMetadata(JsonElement element, string key)
    {
        if (!element.TryGetProperty("metadata", out var metadata) ||
            metadata.ValueKind != JsonValueKind.Object ||
            !metadata.TryGetProperty(key, out var value))
        {
            return null;
        }

        return value.GetString();
    }

    private static string? ReadSubscriptionPriceId(JsonElement subscription)
    {
        if (!subscription.TryGetProperty("items", out var items) ||
            !items.TryGetProperty("data", out var data) ||
            data.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        foreach (var item in data.EnumerateArray())
        {
            if (item.TryGetProperty("price", out var price))
            {
                return ReadString(price, "id");
            }
        }

        return null;
    }

    private static DateTimeOffset? ReadPeriodEnd(JsonElement subscription)
    {
        if (TryReadUnixTime(subscription, "current_period_end", out var rootPeriodEnd))
        {
            return rootPeriodEnd;
        }

        if (subscription.TryGetProperty("items", out var items) &&
            items.TryGetProperty("data", out var data) &&
            data.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in data.EnumerateArray())
            {
                if (TryReadUnixTime(item, "current_period_end", out var itemPeriodEnd))
                {
                    return itemPeriodEnd;
                }
            }
        }

        return null;
    }

    private static bool TryReadUnixTime(
        JsonElement element,
        string propertyName,
        out DateTimeOffset value)
    {
        value = default;
        if (!element.TryGetProperty(propertyName, out var property) ||
            property.ValueKind != JsonValueKind.Number ||
            !property.TryGetInt64(out var seconds))
        {
            return false;
        }

        value = DateTimeOffset.FromUnixTimeSeconds(seconds);
        return true;
    }
}
