using JobTracker.Application.ApplicationWorkflow.Dtos;

namespace JobTracker.Application.ApplicationWorkflow;

public sealed record CvReviewResult(
    decimal AtsMatchScore,
    IReadOnlyList<string> MatchedKeywords,
    IReadOnlyList<string> MissingKeywords,
    string Explanation,
    CvReviewDetailsDto Details);

public sealed record InterviewQuestionsPackage(
    IReadOnlyList<string> Questions,
    byte[] PdfContent,
    string PdfFileName);

public sealed record CoverLetterPackage(
    CoverLetterDto Letter,
    byte[] PdfContent,
    string PdfFileName);
