namespace JobTracker.Domain.Entities;

/// <summary>
/// Persists the four-stage application preparation flow without creating a
/// tracked job application until the user explicitly adds it to the log.
/// </summary>
public sealed class ApplicationDraft
{
    private ApplicationDraft()
    {
    }

    private ApplicationDraft(Guid userId)
    {
        Id = Guid.NewGuid();
        UserId = userId;
        CreatedAt = DateTimeOffset.UtcNow;
        UpdatedAt = CreatedAt;
    }

    public Guid Id { get; private set; }
    public Guid UserId { get; private set; }
    public Guid? MasterCvId { get; private set; }
    public string? JobUrl { get; private set; }
    public string? JobTitle { get; private set; }
    public string? Company { get; private set; }
    public string? JobDescription { get; private set; }
    public string? Location { get; private set; }
    public decimal? OriginalAtsScore { get; private set; }
    public string[] OriginalMatchedKeywords { get; private set; } = [];
    public string[] OriginalMissingKeywords { get; private set; } = [];
    public string? AtsExplanation { get; private set; }
    public string? TailoredContent { get; private set; }
    public decimal? TailoredAtsScore { get; private set; }
    public string[] TailoredMatchedKeywords { get; private set; } = [];
    public string[] TailoredMissingKeywords { get; private set; } = [];
    public byte[]? TailoredPdf { get; private set; }
    public string? TailoredPdfFileName { get; private set; }
    public string[] InterviewQuestions { get; private set; } = [];
    public byte[]? InterviewQuestionsPdf { get; private set; }
    public string? InterviewQuestionsPdfFileName { get; private set; }
    public Guid? LoggedJobApplicationId { get; private set; }
    public DateTimeOffset? CompletedAt { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public MasterCv? MasterCv { get; private set; }
    public JobApplication? LoggedJobApplication { get; private set; }

    public bool IsComplete => CompletedAt.HasValue;
    public bool HasSource =>
        MasterCvId.HasValue &&
        !string.IsNullOrWhiteSpace(JobUrl) &&
        !string.IsNullOrWhiteSpace(JobTitle) &&
        !string.IsNullOrWhiteSpace(Company) &&
        !string.IsNullOrWhiteSpace(JobDescription);

    public static ApplicationDraft Create(Guid userId)
    {
        if (userId == Guid.Empty)
        {
            throw new ArgumentException("A user identifier is required.", nameof(userId));
        }

        return new ApplicationDraft(userId);
    }

    public void SetSource(
        Guid masterCvId,
        string jobUrl,
        string title,
        string company,
        string description,
        string? location)
    {
        EnsureActive();
        if (masterCvId == Guid.Empty)
        {
            throw new ArgumentException("A Master CV identifier is required.", nameof(masterCvId));
        }

        MasterCvId = masterCvId;
        JobUrl = Required(jobUrl, nameof(jobUrl), 2048);
        JobTitle = Required(title, nameof(title), 300);
        Company = Required(company, nameof(company), 200);
        JobDescription = Required(description, nameof(description), 50_000);
        Location = Optional(location, 200);
        ClearGeneratedResults();
        Touch();
    }

    public void SaveReview(
        decimal score,
        IReadOnlyCollection<string> matchedKeywords,
        IReadOnlyCollection<string> missingKeywords,
        string explanation)
    {
        EnsureSource();
        OriginalAtsScore = ValidateScore(score);
        OriginalMatchedKeywords = Normalize(matchedKeywords);
        OriginalMissingKeywords = Normalize(missingKeywords);
        AtsExplanation = Required(explanation, nameof(explanation));
        TailoredContent = null;
        TailoredAtsScore = null;
        TailoredMatchedKeywords = [];
        TailoredMissingKeywords = [];
        TailoredPdf = null;
        TailoredPdfFileName = null;
        InterviewQuestions = [];
        InterviewQuestionsPdf = null;
        InterviewQuestionsPdfFileName = null;
        Touch();
    }

    public void SaveTailoredCv(
        string content,
        decimal score,
        IReadOnlyCollection<string> matchedKeywords,
        IReadOnlyCollection<string> missingKeywords,
        byte[] pdf,
        string fileName)
    {
        EnsureSource();
        if (!OriginalAtsScore.HasValue)
        {
            throw new InvalidOperationException("Review the original CV before tailoring it.");
        }

        if (pdf.Length == 0)
        {
            throw new ArgumentException("The tailored CV PDF cannot be empty.", nameof(pdf));
        }

        TailoredContent = Required(content, nameof(content));
        TailoredAtsScore = ValidateScore(score);
        TailoredMatchedKeywords = Normalize(matchedKeywords);
        TailoredMissingKeywords = Normalize(missingKeywords);
        TailoredPdf = pdf.ToArray();
        TailoredPdfFileName = Required(fileName, nameof(fileName), 255);
        InterviewQuestions = [];
        InterviewQuestionsPdf = null;
        InterviewQuestionsPdfFileName = null;
        Touch();
    }

    public void SaveInterviewQuestions(
        IReadOnlyCollection<string> questions,
        byte[] pdf,
        string fileName)
    {
        EnsureSource();
        if (TailoredPdf is null)
        {
            throw new InvalidOperationException("Tailor the CV before generating interview questions.");
        }

        var normalizedQuestions = Normalize(questions);
        if (normalizedQuestions.Length == 0)
        {
            throw new ArgumentException("At least one interview question is required.", nameof(questions));
        }

        if (pdf.Length == 0)
        {
            throw new ArgumentException("The interview questions PDF cannot be empty.", nameof(pdf));
        }

        InterviewQuestions = normalizedQuestions;
        InterviewQuestionsPdf = pdf.ToArray();
        InterviewQuestionsPdfFileName = Required(fileName, nameof(fileName), 255);
        Touch();
    }

    public void Complete(Guid jobApplicationId)
    {
        EnsureActive();
        if (jobApplicationId == Guid.Empty)
        {
            throw new ArgumentException("A job application identifier is required.", nameof(jobApplicationId));
        }

        EnsureSource();
        LoggedJobApplicationId = jobApplicationId;
        CompletedAt = DateTimeOffset.UtcNow;
        Touch();
    }

    private void ClearGeneratedResults()
    {
        OriginalAtsScore = null;
        OriginalMatchedKeywords = [];
        OriginalMissingKeywords = [];
        AtsExplanation = null;
        TailoredContent = null;
        TailoredAtsScore = null;
        TailoredMatchedKeywords = [];
        TailoredMissingKeywords = [];
        TailoredPdf = null;
        TailoredPdfFileName = null;
        InterviewQuestions = [];
        InterviewQuestionsPdf = null;
        InterviewQuestionsPdfFileName = null;
    }

    private void EnsureSource()
    {
        EnsureActive();
        if (!HasSource)
        {
            throw new InvalidOperationException("Complete the source stage first.");
        }
    }

    private void EnsureActive()
    {
        if (IsComplete)
        {
            throw new InvalidOperationException("The application draft has already been logged.");
        }
    }

    private void Touch() => UpdatedAt = DateTimeOffset.UtcNow;

    private static decimal ValidateScore(decimal score)
    {
        if (score is < 0 or > 100)
        {
            throw new ArgumentOutOfRangeException(nameof(score), "ATS score must be between 0 and 100.");
        }

        return score;
    }

    private static string[] Normalize(IReadOnlyCollection<string> values)
    {
        ArgumentNullException.ThrowIfNull(values);
        return values
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static string Required(string value, string parameterName, int? maxLength = null)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ArgumentException("Value cannot be empty.", parameterName);
        }

        var result = value.Trim();
        if (maxLength.HasValue && result.Length > maxLength.Value)
        {
            throw new ArgumentException(
                $"Value cannot exceed {maxLength.Value} characters.",
                parameterName);
        }

        return result;
    }

    private static string? Optional(string? value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var result = value.Trim();
        if (result.Length > maxLength)
        {
            throw new ArgumentException($"Value cannot exceed {maxLength} characters.", nameof(value));
        }

        return result;
    }
}
