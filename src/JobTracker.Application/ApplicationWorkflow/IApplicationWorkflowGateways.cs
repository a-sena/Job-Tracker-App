using JobTracker.Application.Cvs.Dtos;

namespace JobTracker.Application.ApplicationWorkflow;

public interface ICvReviewGateway
{
    Task<CvReviewResult> ReviewAsync(
        MasterCvContentDto masterCv,
        string jobDescription,
        CancellationToken cancellationToken = default);
}

public interface IInterviewQuestionsGateway
{
    Task<InterviewQuestionsPackage> GenerateAsync(
        string jobTitle,
        string company,
        string jobDescription,
        MasterCvContentDto masterCv,
        CancellationToken cancellationToken = default);
}

public interface ICoverLetterGateway
{
    Task<CoverLetterPackage> GenerateAsync(
        string jobTitle,
        string company,
        string jobDescription,
        MasterCvContentDto cv,
        CancellationToken cancellationToken = default);
}
