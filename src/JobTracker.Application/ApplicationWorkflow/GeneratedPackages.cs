namespace JobTracker.Application.ApplicationWorkflow;

public sealed record CvReviewResult(
    decimal AtsMatchScore,
    IReadOnlyList<string> MatchedKeywords,
    IReadOnlyList<string> MissingKeywords,
    string Explanation);

public sealed record InterviewQuestionsPackage(
    IReadOnlyList<string> Questions,
    byte[] PdfContent,
    string PdfFileName);
