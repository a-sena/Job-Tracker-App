using JobTracker.Domain.Enums;

namespace JobTracker.Application.Jobs.Dtos;

public sealed record JobApplicationDto(
    Guid Id,
    Guid UserId,
    string JobUrl,
    string Title,
    string Company,
    string Description,
    string? Location,
    JobApplicationStatus Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    decimal? AtsMatchScore,
    Guid? TailoredCvId,
    IReadOnlyList<string> MissingKeywords);
