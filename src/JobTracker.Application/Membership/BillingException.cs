namespace JobTracker.Application.Membership;

public sealed class BillingException(
    string message,
    int statusCode,
    Exception? innerException = null) : Exception(message, innerException)
{
    public int StatusCode { get; } = statusCode;
}
