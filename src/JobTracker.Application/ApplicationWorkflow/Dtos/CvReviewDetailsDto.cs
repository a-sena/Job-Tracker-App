namespace JobTracker.Application.ApplicationWorkflow.Dtos;

public sealed record CvReviewDetailsDto(
    IReadOnlyList<CvScoreComponentDto> ScoreBreakdown,
    IReadOnlyList<CvKeywordEvidenceDto> KeywordEvidence,
    IReadOnlyList<string> Strengths,
    IReadOnlyList<string> PriorityActions,
    IReadOnlyList<CvSectionFeedbackDto> SectionFeedback);

public sealed record CvScoreComponentDto(
    string Key,
    string Label,
    decimal Score,
    decimal MaxScore,
    string Explanation);

public sealed record CvKeywordEvidenceDto(
    string Keyword,
    string Section,
    string EvidenceText);

public sealed record CvSectionFeedbackDto(
    string Section,
    string Status,
    IReadOnlyList<string> Findings,
    IReadOnlyList<string> Recommendations);
