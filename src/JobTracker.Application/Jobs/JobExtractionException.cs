namespace JobTracker.Application.Jobs;

public sealed class JobExtractionException(
    string message,
    int upstreamStatusCode,
    Exception? innerException = null) : Exception(message, innerException)
{
    public int UpstreamStatusCode { get; } = upstreamStatusCode;
}
