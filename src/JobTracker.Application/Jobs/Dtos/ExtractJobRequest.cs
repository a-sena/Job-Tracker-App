using System.ComponentModel.DataAnnotations;

namespace JobTracker.Application.Jobs.Dtos;

public sealed class ExtractJobRequest
{
    [Required]
    [Url]
    [StringLength(2048)]
    public string JobUrl { get; init; } = string.Empty;
}
