namespace JobTracker.Application.Jobs.Dtos;

public sealed record ExtractedJobDto(
    string JobUrl,
    string Title,
    string Company,
    string Description,
    string? Location,
    IReadOnlyList<string> Warnings);
