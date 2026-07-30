using JobTracker.Application.ApplicationWorkflow.Dtos;
using JobTracker.Application.Jobs.Dtos;

namespace JobTracker.Application.ApplicationWorkflow;

public interface IApplicationWorkflowService
{
    Task<ApplicationDraftDto?> GetActiveDraftAsync(
        Guid userId,
        CancellationToken cancellationToken = default);

    Task<ApplicationDraftDto> GetOrCreateDraftAsync(
        Guid userId,
        CancellationToken cancellationToken = default);

    Task<ApplicationDraftDto> SetSourceAsync(
        Guid draftId,
        SetApplicationDraftSourceRequest request,
        CancellationToken cancellationToken = default);

    Task<ApplicationDraftDto> ReviewAsync(
        Guid draftId,
        CancellationToken cancellationToken = default);

    Task<ApplicationDraftDto> TailorAsync(
        Guid draftId,
        CancellationToken cancellationToken = default);

    Task<DraftPdfDto?> GetTailoredPdfAsync(
        Guid draftId,
        CancellationToken cancellationToken = default);

    Task<ApplicationDraftDto> GenerateInterviewQuestionsAsync(
        Guid draftId,
        CancellationToken cancellationToken = default);

    Task<DraftPdfDto?> GetInterviewQuestionsPdfAsync(
        Guid draftId,
        CancellationToken cancellationToken = default);

    Task<JobApplicationDto> LogAsync(
        Guid draftId,
        LogApplicationDraftRequest request,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<ApplicationCategoryDto>> GetCategoriesAsync(
        Guid userId,
        CancellationToken cancellationToken = default);
}
