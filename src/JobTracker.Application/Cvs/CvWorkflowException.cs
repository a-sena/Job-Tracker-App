namespace JobTracker.Application.Cvs;

public sealed class CvWorkflowException(
    string message,
    int statusCode,
    Exception? innerException = null) : Exception(message, innerException)
{
    public int StatusCode { get; } = statusCode;
}
