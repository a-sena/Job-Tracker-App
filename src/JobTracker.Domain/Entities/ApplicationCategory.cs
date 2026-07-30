namespace JobTracker.Domain.Entities;

/// <summary>
/// A user-owned grouping for applications in the tracking log.
/// </summary>
public sealed class ApplicationCategory
{
    private ApplicationCategory()
    {
    }

    private ApplicationCategory(Guid userId, string name)
    {
        Id = Guid.NewGuid();
        UserId = userId;
        Name = name;
        CreatedAt = DateTimeOffset.UtcNow;
        UpdatedAt = CreatedAt;
    }

    public Guid Id { get; private set; }

    public Guid UserId { get; private set; }

    public string Name { get; private set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; private set; }

    public DateTimeOffset UpdatedAt { get; private set; }

    public ICollection<JobApplication> JobApplications { get; } = new List<JobApplication>();

    public static ApplicationCategory Create(Guid userId, string name)
    {
        if (userId == Guid.Empty)
        {
            throw new ArgumentException("A user identifier is required.", nameof(userId));
        }

        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("A category name is required.", nameof(name));
        }

        var normalizedName = name.Trim();
        if (normalizedName.Length > 100)
        {
            throw new ArgumentException("A category name cannot exceed 100 characters.", nameof(name));
        }

        return new ApplicationCategory(userId, normalizedName);
    }
}
