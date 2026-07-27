namespace JobTracker.Application.Cvs.Dtos;

public sealed record TailoredCvDto(
    Guid Id,
    Guid MasterCvId,
    Guid JobApplicationId,
    string Summary,
    decimal AtsMatchScore,
    IReadOnlyList<string> MissingKeywords,
    string PdfFileName,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record TailoredCvPdfDto(
    byte[] Content,
    string FileName);

public sealed record TailoredCvSummaryDto(
    Guid Id,
    Guid JobApplicationId,
    decimal AtsMatchScore,
    IReadOnlyList<string> MissingKeywords,
    DateTimeOffset CreatedAt);
