using System.ComponentModel.DataAnnotations;
using JobTracker.Domain.Enums;

namespace JobTracker.Application.Jobs.Dtos;

public sealed class UpdateJobDetailsRequest : IValidatableObject
{
    [StringLength(100_000)]
    public string? Description { get; init; }

    [StringLength(200)]
    public string? Location { get; init; }

    [StringLength(200)]
    public string? RecruiterName { get; init; }

    [EmailAddress, StringLength(320)]
    public string? RecruiterEmail { get; init; }

    [Url, StringLength(2048)]
    public string? RecruiterLinkedInUrl { get; init; }

    [StringLength(200)]
    public string? SalaryRange { get; init; }

    public WorkArrangement WorkArrangement { get; init; }

    [StringLength(10_000)]
    public string? PersonalNotes { get; init; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (Description is not null && string.IsNullOrWhiteSpace(Description))
        {
            yield return new ValidationResult(
                "The vacancy description cannot be empty.",
                [nameof(Description)]);
        }

        if (!Enum.IsDefined(WorkArrangement))
        {
            yield return new ValidationResult(
                "The work arrangement is not supported.",
                [nameof(WorkArrangement)]);
        }
    }
}
