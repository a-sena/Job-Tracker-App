namespace JobTracker.Domain.Enums;

/// <summary>
/// Represents the current stage of a job application.
/// </summary>
public enum JobApplicationStatus
{
    Applied = 1,
    Interviewing = 2,
    Offer = 3,
    Rejected = 4
}
