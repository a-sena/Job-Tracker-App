namespace JobTracker.Infrastructure.Billing;

internal sealed class StripeBillingOptions
{
    public const string SectionName = "Stripe";

    public string SecretKey { get; init; } = string.Empty;

    public string WebhookSecret { get; init; } = string.Empty;

    public string MonthlyPriceId { get; init; } = string.Empty;

    public string AnnualPriceId { get; init; } = string.Empty;

    public string SuccessUrl { get; init; } = string.Empty;

    public string CancelUrl { get; init; } = string.Empty;

    public string PortalReturnUrl { get; init; } = string.Empty;

    public bool IsComplete =>
        SecretKey.StartsWith("sk_", StringComparison.Ordinal) &&
        WebhookSecret.StartsWith("whsec_", StringComparison.Ordinal) &&
        MonthlyPriceId.StartsWith("price_", StringComparison.Ordinal) &&
        AnnualPriceId.StartsWith("price_", StringComparison.Ordinal) &&
        IsAbsoluteHttpUrl(SuccessUrl) &&
        IsAbsoluteHttpUrl(CancelUrl) &&
        IsAbsoluteHttpUrl(PortalReturnUrl);

    private static bool IsAbsoluteHttpUrl(string value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
        (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
}
