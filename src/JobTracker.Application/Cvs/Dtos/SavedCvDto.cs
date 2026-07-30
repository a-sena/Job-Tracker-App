namespace JobTracker.Application.Cvs.Dtos;

public sealed record SavedCvDto(
    Guid Id,
    Guid UserId,
    string Name,
    string? OriginalFileName,
    bool IsDefault,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record RenameSavedCvRequest(string Name);
