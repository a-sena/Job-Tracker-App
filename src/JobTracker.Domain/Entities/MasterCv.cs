namespace JobTracker.Domain.Entities;

/// <summary>
/// The user's source CV. Tailored CVs may only rephrase or emphasize information
/// contained in this document.
/// </summary>
public sealed class MasterCv
{
    private MasterCv()
    {
    }

    private MasterCv(Guid userId, string name, string content)
    {
        Id = Guid.NewGuid();
        UserId = userId;
        Name = name;
        Content = content;
        CreatedAt = DateTimeOffset.UtcNow;
        UpdatedAt = CreatedAt;
    }

    public Guid Id { get; private set; }

    public Guid UserId { get; private set; }

    public string Name { get; private set; } = string.Empty;

    /// <summary>
    /// Normalized source CV content used as the factual boundary for AI tailoring.
    /// </summary>
    public string Content { get; private set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; private set; }

    public DateTimeOffset UpdatedAt { get; private set; }

    public ICollection<TailoredCv> TailoredCvs { get; } = new List<TailoredCv>();

    public static MasterCv Create(Guid userId, string name, string content)
    {
        if (userId == Guid.Empty)
        {
            throw new ArgumentException("A user identifier is required.", nameof(userId));
        }

        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("A CV name is required.", nameof(name));
        }

        if (string.IsNullOrWhiteSpace(content))
        {
            throw new ArgumentException("CV content is required.", nameof(content));
        }

        return new MasterCv(userId, name.Trim(), content.Trim());
    }

    public void Update(string name, string content)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("A CV name is required.", nameof(name));
        }

        if (string.IsNullOrWhiteSpace(content))
        {
            throw new ArgumentException("CV content is required.", nameof(content));
        }

        Name = name.Trim();
        Content = content.Trim();
        UpdatedAt = DateTimeOffset.UtcNow;
    }
}
