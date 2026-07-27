namespace JobTracker.Domain.Entities;

/// <summary>
/// A job-specific CV derived from a MasterCv without introducing unverified facts.
/// </summary>
public sealed class TailoredCv
{
    private TailoredCv()
    {
    }

    private TailoredCv(
        Guid masterCvId,
        Guid jobApplicationId,
        string summary,
        string content,
        decimal atsMatchScore,
        IReadOnlyCollection<string> missingKeywords,
        byte[] pdfContent,
        string pdfFileName)
    {
        Id = Guid.NewGuid();
        MasterCvId = masterCvId;
        JobApplicationId = jobApplicationId;
        Summary = summary;
        Content = content;
        AtsMatchScore = atsMatchScore;
        MissingKeywords = missingKeywords
            .Where(keyword => !string.IsNullOrWhiteSpace(keyword))
            .Select(keyword => keyword.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        PdfContent = pdfContent.ToArray();
        PdfFileName = pdfFileName;
        CreatedAt = DateTimeOffset.UtcNow;
        UpdatedAt = CreatedAt;
    }

    public Guid Id { get; private set; }

    public Guid MasterCvId { get; private set; }

    public Guid JobApplicationId { get; private set; }

    public string Summary { get; private set; } = string.Empty;

    /// <summary>
    /// Complete tailored CV content. It must remain grounded in the linked MasterCv.
    /// </summary>
    public string Content { get; private set; } = string.Empty;

    public decimal AtsMatchScore { get; private set; }

    public string[] MissingKeywords { get; private set; } = [];

    public byte[] PdfContent { get; private set; } = [];

    public string PdfFileName { get; private set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; private set; }

    public DateTimeOffset UpdatedAt { get; private set; }

    public MasterCv MasterCv { get; private set; } = null!;

    public JobApplication JobApplication { get; private set; } = null!;

    public static TailoredCv Create(
        Guid masterCvId,
        Guid jobApplicationId,
        string summary,
        string content,
        decimal atsMatchScore,
        IReadOnlyCollection<string> missingKeywords,
        byte[] pdfContent,
        string pdfFileName)
    {
        if (masterCvId == Guid.Empty)
        {
            throw new ArgumentException("A master CV identifier is required.", nameof(masterCvId));
        }

        if (jobApplicationId == Guid.Empty)
        {
            throw new ArgumentException("A job application identifier is required.", nameof(jobApplicationId));
        }

        if (string.IsNullOrWhiteSpace(summary))
        {
            throw new ArgumentException("A tailored summary is required.", nameof(summary));
        }

        if (string.IsNullOrWhiteSpace(content))
        {
            throw new ArgumentException("Tailored CV content is required.", nameof(content));
        }

        if (atsMatchScore is < 0 or > 100)
        {
            throw new ArgumentOutOfRangeException(
                nameof(atsMatchScore),
                atsMatchScore,
                "The ATS match score must be between 0 and 100.");
        }

        ArgumentNullException.ThrowIfNull(missingKeywords);
        ArgumentNullException.ThrowIfNull(pdfContent);

        if (pdfContent.Length == 0)
        {
            throw new ArgumentException("PDF content is required.", nameof(pdfContent));
        }

        if (string.IsNullOrWhiteSpace(pdfFileName))
        {
            throw new ArgumentException("A PDF filename is required.", nameof(pdfFileName));
        }

        return new TailoredCv(
            masterCvId,
            jobApplicationId,
            summary.Trim(),
            content.Trim(),
            atsMatchScore,
            missingKeywords,
            pdfContent,
            pdfFileName.Trim());
    }
}
