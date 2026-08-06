namespace JobTracker.Application.Membership;

public enum BillingCycle
{
    Monthly,
    Annual
}

public sealed record BillingRedirectDto(string Url);

public interface IBillingService
{
    bool IsConfigured { get; }

    Task<BillingRedirectDto> CreateCheckoutSessionAsync(
        BillingCycle billingCycle,
        Guid checkoutRequestId,
        CancellationToken cancellationToken = default);

    Task<BillingRedirectDto> CreateCustomerPortalSessionAsync(
        CancellationToken cancellationToken = default);

    Task ProcessWebhookAsync(
        string payload,
        string signature,
        CancellationToken cancellationToken = default);
}
