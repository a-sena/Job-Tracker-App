using JobTracker.Domain.Enums;

namespace JobTracker.Domain.Entities;

/// <summary>
/// A vacancy saved by a user and tracked through the recruitment process.
/// </summary>
public sealed class JobApplication
{
    private JobApplication()
    {
    }

    private JobApplication(
        Guid userId,
        string jobUrl,
        string title,
        string company,
        string description,
        string? location,
        string? recruiterName,
        string? recruiterEmail,
        string? recruiterLinkedInUrl,
        string? salaryRange,
        WorkArrangement workArrangement,
        string? personalNotes)
    {
        Id = Guid.NewGuid();
        UserId = userId;
        JobUrl = jobUrl;
        Title = title;
        Company = company;
        Description = description;
        UpdateDetails(
            location,
            recruiterName,
            recruiterEmail,
            recruiterLinkedInUrl,
            salaryRange,
            workArrangement,
            personalNotes,
            touchUpdatedAt: false);
        Status = JobApplicationStatus.Applied;
        CreatedAt = DateTimeOffset.UtcNow;
        UpdatedAt = CreatedAt;
    }

    public Guid Id { get; private set; }

    /// <summary>
    /// Ownership boundary used until the authentication user entity is introduced.
    /// </summary>
    public Guid UserId { get; private set; }

    public string JobUrl { get; private set; } = string.Empty;

    public string Title { get; private set; } = string.Empty;

    public string Company { get; private set; } = string.Empty;

    public string Description { get; private set; } = string.Empty;

    public string? Location { get; private set; }

    public string? RecruiterName { get; private set; }

    public string? RecruiterEmail { get; private set; }

    public string? RecruiterLinkedInUrl { get; private set; }

    public string? SalaryRange { get; private set; }

    public WorkArrangement WorkArrangement { get; private set; }

    public string? PersonalNotes { get; private set; }

    public Guid? CategoryId { get; private set; }

    public JobApplicationStatus Status { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public DateTimeOffset UpdatedAt { get; private set; }

    public ICollection<TailoredCv> TailoredCvs { get; } = new List<TailoredCv>();

    public ApplicationCategory? Category { get; private set; }

    public static JobApplication Create(
        Guid userId,
        string jobUrl,
        string title,
        string company,
        string description,
        string? location,
        string? recruiterName = null,
        string? recruiterEmail = null,
        string? recruiterLinkedInUrl = null,
        string? salaryRange = null,
        WorkArrangement workArrangement = WorkArrangement.Unspecified,
        string? personalNotes = null)
    {
        if (userId == Guid.Empty)
        {
            throw new ArgumentException("A user identifier is required.", nameof(userId));
        }

        return new JobApplication(
            userId,
            Required(jobUrl, nameof(jobUrl)),
            Required(title, nameof(title)),
            Required(company, nameof(company)),
            Required(description, nameof(description)),
            location,
            recruiterName,
            recruiterEmail,
            recruiterLinkedInUrl,
            salaryRange,
            workArrangement,
            personalNotes);
    }

    public void UpdateDetails(
        string? location,
        string? recruiterName,
        string? recruiterEmail,
        string? recruiterLinkedInUrl,
        string? salaryRange,
        WorkArrangement workArrangement,
        string? personalNotes) =>
        UpdateDetails(
            location,
            recruiterName,
            recruiterEmail,
            recruiterLinkedInUrl,
            salaryRange,
            workArrangement,
            personalNotes,
            touchUpdatedAt: true);

    public void UpdateDescription(string description)
    {
        Description = Required(description, nameof(description));
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    private void UpdateDetails(
        string? location,
        string? recruiterName,
        string? recruiterEmail,
        string? recruiterLinkedInUrl,
        string? salaryRange,
        WorkArrangement workArrangement,
        string? personalNotes,
        bool touchUpdatedAt)
    {
        if (!Enum.IsDefined(workArrangement))
        {
            throw new ArgumentOutOfRangeException(
                nameof(workArrangement),
                workArrangement,
                "Unsupported work arrangement.");
        }

        Location = Optional(location);
        RecruiterName = Optional(recruiterName);
        RecruiterEmail = Optional(recruiterEmail);
        RecruiterLinkedInUrl = Optional(recruiterLinkedInUrl);
        SalaryRange = Optional(salaryRange);
        WorkArrangement = workArrangement;
        PersonalNotes = Optional(personalNotes);

        if (touchUpdatedAt)
        {
            UpdatedAt = DateTimeOffset.UtcNow;
        }
    }

    public void ChangeStatus(JobApplicationStatus status)
    {
        if (!Enum.IsDefined(status))
        {
            throw new ArgumentOutOfRangeException(nameof(status), status, "Unsupported job application status.");
        }

        Status = status;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void AssignCategory(Guid categoryId)
    {
        if (categoryId == Guid.Empty)
        {
            throw new ArgumentException("A category identifier is required.", nameof(categoryId));
        }

        CategoryId = categoryId;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void AssignCategory(ApplicationCategory category)
    {
        ArgumentNullException.ThrowIfNull(category);
        if (category.UserId != UserId)
        {
            throw new InvalidOperationException(
                "A job application and its category must belong to the same user.");
        }

        Category = category;
        CategoryId = category.Id;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    private static string Required(string value, string parameterName)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ArgumentException("Value cannot be empty.", parameterName);
        }

        return value.Trim();
    }

    private static string? Optional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
