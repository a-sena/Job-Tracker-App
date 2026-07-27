namespace JobTracker.Application.Cvs.Dtos;

public sealed record MasterCvDto(
    Guid Id,
    Guid UserId,
    string Name,
    MasterCvContentDto Content,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);
