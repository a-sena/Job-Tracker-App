namespace JobTracker.Application.Cvs.Dtos;

public sealed record ImportedMasterCvDto(
    MasterCvContentDto Content,
    IReadOnlyList<string> Warnings,
    string SourceFileName);
