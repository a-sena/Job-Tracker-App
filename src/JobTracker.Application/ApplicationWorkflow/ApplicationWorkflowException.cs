namespace JobTracker.Application.ApplicationWorkflow;

public sealed class ApplicationWorkflowException(
    string message,
    int statusCode,
    Exception? innerException = null) : Exception(message, innerException)
{
    public int StatusCode { get; } = statusCode;
}
