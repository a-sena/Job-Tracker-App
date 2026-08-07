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
    CoverLetterDto? CoverLetter,
    string? CoverLetterPdfFileName,
    IReadOnlyList<string> InterviewQuestions,
    IReadOnlyList<string> InterviewAnswers,
    string? InterviewQuestionsPdfFileName,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    string? MasterCvName);

public sealed record ApplicationCategoryDto(
    Guid Id,
    Guid UserId,
    string Name,
    DateTimeOffset CreatedAt);

public sealed record DraftPdfDto(byte[] Content, string FileName);

public sealed record TailoredCvComparisonDto(
    Guid DraftId,
    MasterCvContentDto Original,
    MasterCvContentDto Tailored,
    IReadOnlyList<TailoredCvChangeDto> Changes);

public sealed record TailoredCvChangeDto(
    string Id,
    string Section,
    string Label,
    string OriginalText,
    string TailoredText);

public sealed class ApproveTailoredCvChangesRequest
{
    [MaxLength(1_000)]
    public IReadOnlyList<string> AcceptedChangeIds { get; init; } = [];
}

public sealed record CoverLetterDto(
    string Language,
    string Subject,
    IReadOnlyList<string> Paragraphs,
    IReadOnlyList<CoverLetterEvidenceDto> Evidence);

public sealed record CoverLetterEvidenceDto(
    string Claim,
    string EvidenceText);

public sealed class SaveInterviewAnswersRequest : IValidatableObject
{
    [Required, MaxLength(50)]
    public IReadOnlyList<string> Answers { get; init; } = [];

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (Answers is null)
        {
            yield break;
        }

        for (var index = 0; index < Answers.Count; index++)
        {
            if ((Answers[index] ?? string.Empty).Length > 5_000)
            {
                yield return new ValidationResult(
                    $"Answer {index + 1} cannot exceed 5,000 characters.",
                    [nameof(Answers)]);
            }
        }
    }
}
