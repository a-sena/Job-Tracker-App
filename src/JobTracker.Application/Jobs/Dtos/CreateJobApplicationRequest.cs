using System.ComponentModel.DataAnnotations;

namespace JobTracker.Application.Jobs.Dtos;

public sealed class CreateJobApplicationRequest : IValidatableObject
{
    [Required]
    public Guid UserId { get; init; }

    [Required]
    [Url]
    [StringLength(2048)]
    public string JobUrl { get; init; } = string.Empty;

    [Required]
    [StringLength(300)]
    public string Title { get; init; } = string.Empty;

    [Required]
    [StringLength(200)]
    public string Company { get; init; } = string.Empty;

    [Required]
    public string Description { get; init; } = string.Empty;

    [StringLength(200)]
    public string? Location { get; init; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (UserId == Guid.Empty)
        {
            yield return new ValidationResult(
                "A non-empty user identifier is required.",
                [nameof(UserId)]);
        }
    }
}
