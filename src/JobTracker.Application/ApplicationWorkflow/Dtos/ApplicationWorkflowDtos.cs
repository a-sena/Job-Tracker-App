using System.ComponentModel.DataAnnotations;
using JobTracker.Application.Cvs.Dtos;

namespace JobTracker.Application.ApplicationWorkflow.Dtos;

public sealed record CreateApplicationDraftRequest(Guid UserId);

public sealed class SetApplicationDraftSourceRequest
{
    public Guid MasterCvId { get; init; }

    [Required, Url, StringLength(2048)]
    public string JobUrl { get; init; } = string.Empty;

    [Required, StringLength(300)]
    public string Title { get; init; } = string.Empty;

    [Required, StringLength(200)]
    public string Company { get; init; } = string.Empty;

    [Required, StringLength(50_000, MinimumLength = 20)]
    public string Description { get; init; } = string.Empty;

    [StringLength(200)]
    public string? Location { get; init; }
}

public sealed class LogApplicationDraftRequest
{
    public Guid? CategoryId { get; init; }

    [StringLength(100)]
    public string? NewCategoryName { get; init; }
}

public sealed record ApplicationDraftDto(
    Guid Id,
    Guid UserId,
    Guid? MasterCvId,
    string? JobUrl,
    string? Title,
    string? Company,
    string? Description,
    string? Location,
    decimal? OriginalAtsScore,
    IReadOnlyList<string> OriginalMatchedKeywords,
    IReadOnlyList<string> OriginalMissingKeywords,
    string? OriginalAtsExplanation,
    CvReviewDetailsDto? OriginalReviewDetails,
    decimal? TailoredAtsScore,
    IReadOnlyList<string> TailoredMatchedKeywords,
    IReadOnlyList<string> TailoredMissingKeywords,
    string? TailoredPdfFileName,
    IReadOnlyList<string> InterviewQuestions,
    string? InterviewQuestionsPdfFileName,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record ApplicationCategoryDto(
    Guid Id,
    Guid UserId,
    string Name,
    DateTimeOffset CreatedAt);

public sealed record DraftPdfDto(byte[] Content, string FileName);

public sealed record TailoredCvComparisonDto(
    Guid DraftId,
    MasterCvContentDto Original,
    MasterCvContentDto Tailored);
