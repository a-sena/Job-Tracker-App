using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace JobTracker.Application.Cvs.Dtos;

public sealed class MasterCvContentDto
{
    [Required, StringLength(200)]
    public string FullName { get; init; } = string.Empty;

    [StringLength(200)]
    public string? Headline { get; init; }

    [Required, StringLength(5_000, MinimumLength = 20)]
    public string ProfessionalSummary { get; init; } = string.Empty;

    [EmailAddress, StringLength(320)]
    public string? Email { get; init; }

    [StringLength(100)]
    public string? Phone { get; init; }

    [StringLength(200)]
    public string? Location { get; init; }

    [Url, StringLength(500)]
    [JsonPropertyName("linkedin")]
    public string? LinkedIn { get; init; }

    [Url, StringLength(500)]
    public string? Website { get; init; }

    [MaxLength(100)]
    public IReadOnlyList<string> Skills { get; init; } = [];

    [MaxLength(30)]
    public IReadOnlyList<WorkExperienceDto> WorkExperience { get; init; } = [];

    [MaxLength(30)]
    public IReadOnlyList<ProjectDto> Projects { get; init; } = [];

    [MaxLength(20)]
    public IReadOnlyList<EducationDto> Education { get; init; } = [];

    [MaxLength(50)]
    public IReadOnlyList<string> Certifications { get; init; } = [];

    [MaxLength(50)]
    public IReadOnlyList<CourseDto> Courses { get; init; } = [];

    [MaxLength(30)]
    public IReadOnlyList<string> Languages { get; init; } = [];
}

public sealed class WorkExperienceDto
{
    [Required, StringLength(200)]
    public string Company { get; init; } = string.Empty;

    [Required, StringLength(200)]
    public string JobTitle { get; init; } = string.Empty;

    [Required, StringLength(50)]
    public string StartDate { get; init; } = string.Empty;

    [Required, StringLength(50)]
    public string EndDate { get; init; } = string.Empty;

    [StringLength(200)]
    public string? Location { get; init; }

    [MinLength(1), MaxLength(30)]
    public IReadOnlyList<string> BulletPoints { get; init; } = [];
}

public sealed class EducationDto
{
    [Required, StringLength(200)]
    public string Institution { get; init; } = string.Empty;

    [Required, StringLength(200)]
    public string Qualification { get; init; } = string.Empty;

    [StringLength(50)]
    public string? StartDate { get; init; }

    [StringLength(50)]
    public string? EndDate { get; init; }

    [StringLength(200)]
    public string? Location { get; init; }

    [MaxLength(20)]
    public IReadOnlyList<string> Details { get; init; } = [];
}

public sealed class ProjectDto
{
    [Required, StringLength(200)]
    public string Name { get; init; } = string.Empty;

    [StringLength(200)]
    public string? Role { get; init; }

    [StringLength(50)]
    public string? StartDate { get; init; }

    [StringLength(50)]
    public string? EndDate { get; init; }

    [Url, StringLength(500)]
    public string? Url { get; init; }

    [MaxLength(50)]
    public IReadOnlyList<string> Technologies { get; init; } = [];

    [MaxLength(30)]
    public IReadOnlyList<string> BulletPoints { get; init; } = [];
}

public sealed class CourseDto
{
    [Required, StringLength(300)]
    public string Name { get; init; } = string.Empty;

    [StringLength(200)]
    public string? Provider { get; init; }

    [StringLength(50)]
    public string? CompletedDate { get; init; }

    [MaxLength(20)]
    public IReadOnlyList<string> Details { get; init; } = [];
}
