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

    private MasterCv(
        Guid userId,
        string name,
        string content,
        byte[]? originalPdf,
        string? originalFileName,
        bool isDefault)
    {
        Id = Guid.NewGuid();
        UserId = userId;
        Name = name;
        Content = content;
        OriginalPdf = originalPdf?.ToArray();
        OriginalFileName = originalFileName;
        IsDefault = isDefault;
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

    public byte[]? OriginalPdf { get; private set; }

    public string? OriginalFileName { get; private set; }

    public bool IsDefault { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public DateTimeOffset UpdatedAt { get; private set; }

    public ICollection<TailoredCv> TailoredCvs { get; } = new List<TailoredCv>();

    public static MasterCv Create(Guid userId, string name, string content)
        => Create(userId, name, content, null, null, false);

    public static MasterCv Create(
        Guid userId,
        string name,
        string content,
        byte[]? originalPdf,
        string? originalFileName,
        bool isDefault)
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

        if (originalPdf is { Length: 0 })
        {
            throw new ArgumentException("The original PDF cannot be empty.", nameof(originalPdf));
        }

        if (originalPdf is not null && string.IsNullOrWhiteSpace(originalFileName))
        {
            throw new ArgumentException(
                "The original filename is required when a PDF is stored.",
                nameof(originalFileName));
        }

        return new MasterCv(
            userId,
            name.Trim(),
            content.Trim(),
            originalPdf,
            string.IsNullOrWhiteSpace(originalFileName)
                ? null
                : originalFileName.Trim(),
            isDefault);
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

    public void Rename(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("A CV name is required.", nameof(name));
        }

        var normalizedName = name.Trim();
        if (normalizedName.Length > 150)
        {
            throw new ArgumentException("A CV name cannot exceed 150 characters.", nameof(name));
        }

        Name = normalizedName;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void SetDefault(bool isDefault)
    {
        IsDefault = isDefault;
        UpdatedAt = DateTimeOffset.UtcNow;
    }
}
