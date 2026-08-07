using System.ComponentModel.DataAnnotations;

namespace JobTracker.Application.Jobs.Dtos;

public sealed class UpdateJobDescriptionRequest : IValidatableObject
{
    [Required, StringLength(100_000)]
    public string Description { get; init; } = string.Empty;

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (string.IsNullOrWhiteSpace(Description))
        {
            yield return new ValidationResult(
                "The vacancy description cannot be empty.",
                [nameof(Description)]);
        }
    }
}
