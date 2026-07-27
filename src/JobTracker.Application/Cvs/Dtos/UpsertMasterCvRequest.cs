using System.ComponentModel.DataAnnotations;

namespace JobTracker.Application.Cvs.Dtos;

public sealed class UpsertMasterCvRequest
{
    [Required, StringLength(150)]
    public string Name { get; init; } = "Master CV";

    [Required]
    public MasterCvContentDto Content { get; init; } = new();
}
