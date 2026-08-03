using JobTracker.Application.Cvs.Dtos;

namespace JobTracker.Application.Cvs;

public sealed record GeneratedTailoredCvPackage(
    MasterCvContentDto TailoredContent,
    decimal AtsMatchScore,
    IReadOnlyList<string> MatchedKeywords,
    IReadOnlyList<string> MissingKeywords,
    byte[] PdfContent,
    string PdfFileName);

public sealed record CvKeywordBaseline(
    IReadOnlyList<string> MatchedKeywords,
    IReadOnlyList<string> MissingKeywords);
