using System.Text.Json;
using JobTracker.Application.Abstractions.Persistence;
using JobTracker.Application.ApplicationWorkflow.Dtos;
using JobTracker.Application.Cvs;
using JobTracker.Application.Cvs.Dtos;
using JobTracker.Application.Jobs.Dtos;
using JobTracker.Application.Jobs.Mappings;
using JobTracker.Domain.Entities;

namespace JobTracker.Application.ApplicationWorkflow;

internal sealed class ApplicationWorkflowService(
    IApplicationDraftRepository draftRepository,
    IApplicationCategoryRepository categoryRepository,
    IMasterCvRepository masterCvRepository,
    IJobApplicationRepository jobApplicationRepository,
    ITailoredCvRepository tailoredCvRepository,
    ICvReviewGateway reviewGateway,
    ICvTailoringGateway tailoringGateway,
    IInterviewQuestionsGateway interviewQuestionsGateway) : IApplicationWorkflowService
{
    private const string UncategorizedName = "Uncategorized";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<ApplicationDraftDto?> GetActiveDraftAsync(
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        EnsureUserId(userId);
        var draft = await draftRepository.GetActiveByUserIdAsync(userId, cancellationToken: cancellationToken);
        return draft is null ? null : ToDto(draft);
    }

    public async Task<ApplicationDraftDto> GetOrCreateDraftAsync(
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        EnsureUserId(userId);
        var draft = await draftRepository.GetOrCreateActiveAsync(userId, cancellationToken);
        return ToDto(draft);
    }

    public async Task<ApplicationDraftDto> SetSourceAsync(
        Guid draftId,
        SetApplicationDraftSourceRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        var draft = await GetRequiredDraftAsync(draftId, cancellationToken);
        var masterCv = await masterCvRepository.GetByIdAsync(
            request.MasterCvId,
            cancellationToken: cancellationToken)
            ?? throw new ApplicationWorkflowException("The selected CV was not found.", 404);
        if (masterCv.UserId != draft.UserId)
        {
            throw new ApplicationWorkflowException("The selected CV does not belong to this user.", 403);
        }

        try
        {
            draft.SetSource(
                request.MasterCvId,
                request.JobUrl,
                request.Title,
                request.Company,
                request.Description,
                request.Location);
        }
        catch (ArgumentException exception)
        {
            throw new ApplicationWorkflowException(exception.Message, 400, exception);
        }

        await draftRepository.SaveChangesAsync(cancellationToken);
        return ToDto(draft);
    }

    public async Task<ApplicationDraftDto> ReviewAsync(
        Guid draftId,
        CancellationToken cancellationToken = default)
    {
        var draft = await GetRequiredDraftAsync(draftId, cancellationToken);
        var (masterCv, content) = await GetDraftCvAsync(draft, cancellationToken);
        _ = masterCv;

        var result = await reviewGateway.ReviewAsync(
            content,
            RequireDescription(draft),
            cancellationToken);
        try
        {
            draft.SaveReview(
                result.AtsMatchScore,
                result.MatchedKeywords,
                result.MissingKeywords,
                result.Explanation);
        }
        catch (Exception exception) when (exception is ArgumentException or InvalidOperationException)
        {
            throw new ApplicationWorkflowException(exception.Message, 409, exception);
        }

        await draftRepository.SaveChangesAsync(cancellationToken);
        return ToDto(draft);
    }

    public async Task<ApplicationDraftDto> TailorAsync(
        Guid draftId,
        CancellationToken cancellationToken = default)
    {
        var draft = await GetRequiredDraftAsync(draftId, cancellationToken);
        if (!draft.OriginalAtsScore.HasValue)
        {
            throw new ApplicationWorkflowException("Review the original CV before tailoring it.", 409);
        }

        var (_, originalContent) = await GetDraftCvAsync(draft, cancellationToken);
        var generated = await tailoringGateway.GenerateAsync(
            originalContent,
            RequireDescription(draft),
            cancellationToken);
        ValidateGrounding(originalContent, generated.TailoredContent);

        try
        {
            draft.SaveTailoredCv(
                JsonSerializer.Serialize(generated.TailoredContent, JsonOptions),
                generated.AtsMatchScore,
                generated.MatchedKeywords,
                generated.MissingKeywords,
                generated.PdfContent,
                generated.PdfFileName);
        }
        catch (Exception exception) when (exception is ArgumentException or InvalidOperationException)
        {
            throw new ApplicationWorkflowException(exception.Message, 409, exception);
        }

        await draftRepository.SaveChangesAsync(cancellationToken);
        return ToDto(draft);
    }

    public async Task<DraftPdfDto?> GetTailoredPdfAsync(
        Guid draftId,
        CancellationToken cancellationToken = default)
    {
        var draft = await draftRepository.GetByIdAsync(draftId, cancellationToken: cancellationToken);
        return draft?.TailoredPdf is null || string.IsNullOrWhiteSpace(draft.TailoredPdfFileName)
            ? null
            : new DraftPdfDto(draft.TailoredPdf.ToArray(), draft.TailoredPdfFileName);
    }

    public async Task<TailoredCvComparisonDto> GetTailoredComparisonAsync(
        Guid draftId,
        CancellationToken cancellationToken = default)
    {
        var draft = await draftRepository.GetByIdAsync(
            draftId,
            cancellationToken: cancellationToken)
            ?? throw new ApplicationWorkflowException("The application draft was not found.", 404);
        if (!draft.MasterCvId.HasValue || string.IsNullOrWhiteSpace(draft.TailoredContent))
        {
            throw new ApplicationWorkflowException("Tailor the CV before reviewing changes.", 409);
        }

        var masterCv = await masterCvRepository.GetByIdAsync(
            draft.MasterCvId.Value,
            cancellationToken: cancellationToken)
            ?? throw new ApplicationWorkflowException("The source CV was not found.", 404);

        return new TailoredCvComparisonDto(
            draft.Id,
            DeserializeContent(masterCv.Content),
            DeserializeContent(draft.TailoredContent));
    }

    public async Task<ApplicationDraftDto> GenerateInterviewQuestionsAsync(
        Guid draftId,
        CancellationToken cancellationToken = default)
    {
        var draft = await GetRequiredDraftAsync(draftId, cancellationToken);
        if (draft.TailoredPdf is null)
        {
            throw new ApplicationWorkflowException("Tailor the CV before generating interview questions.", 409);
        }

        var (_, content) = await GetDraftCvAsync(draft, cancellationToken);
        var package = await interviewQuestionsGateway.GenerateAsync(
            draft.JobTitle!,
            draft.Company!,
            RequireDescription(draft),
            content,
            cancellationToken);
        try
        {
            draft.SaveInterviewQuestions(
                package.Questions,
                package.PdfContent,
                package.PdfFileName);
        }
        catch (Exception exception) when (exception is ArgumentException or InvalidOperationException)
        {
            throw new ApplicationWorkflowException(exception.Message, 409, exception);
        }

        await draftRepository.SaveChangesAsync(cancellationToken);
        return ToDto(draft);
    }

    public async Task<DraftPdfDto?> GetInterviewQuestionsPdfAsync(
        Guid draftId,
        CancellationToken cancellationToken = default)
    {
        var draft = await draftRepository.GetByIdAsync(draftId, cancellationToken: cancellationToken);
        return draft?.InterviewQuestionsPdf is null ||
            string.IsNullOrWhiteSpace(draft.InterviewQuestionsPdfFileName)
            ? null
            : new DraftPdfDto(
                draft.InterviewQuestionsPdf.ToArray(),
                draft.InterviewQuestionsPdfFileName);
    }

    public async Task<JobApplicationDto> LogAsync(
        Guid draftId,
        LogApplicationDraftRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        var draft = await GetRequiredDraftAsync(draftId, cancellationToken);
        if (!draft.HasSource)
        {
            throw new ApplicationWorkflowException(
                "Choose a CV and complete the vacancy details before adding this application to the log.",
                409);
        }

        if (request.CategoryId.HasValue && !string.IsNullOrWhiteSpace(request.NewCategoryName))
        {
            throw new ApplicationWorkflowException(
                "Choose an existing category or create a new one, not both.",
                400);
        }

        var category = await ResolveCategoryAsync(draft.UserId, request, cancellationToken);
        var job = JobApplication.Create(
            draft.UserId,
            draft.JobUrl!,
            draft.JobTitle!,
            draft.Company!,
            draft.JobDescription!,
            draft.Location);
        job.AssignCategory(category);
        await jobApplicationRepository.AddAsync(job, cancellationToken);

        TailoredCv? tailoredCv = null;
        if (draft.TailoredContent is not null &&
            draft.TailoredAtsScore.HasValue &&
            draft.TailoredPdf is not null &&
            draft.TailoredPdfFileName is not null &&
            draft.MasterCvId.HasValue)
        {
            var tailoredContent = DeserializeContent(draft.TailoredContent);
            tailoredCv = TailoredCv.Create(
                draft.MasterCvId.Value,
                job.Id,
                tailoredContent.ProfessionalSummary,
                draft.TailoredContent,
                draft.TailoredAtsScore.Value,
                draft.TailoredMissingKeywords,
                draft.TailoredPdf,
                draft.TailoredPdfFileName);
            await tailoredCvRepository.AddAsync(tailoredCv, cancellationToken);
        }

        draft.Complete(job.Id);
        await draftRepository.SaveChangesAsync(cancellationToken);

        return job.ToDto(
            tailoredCv is null
                ? null
                : new TailoredCvSummaryDto(
                    tailoredCv.Id,
                    job.Id,
                    tailoredCv.AtsMatchScore,
                    tailoredCv.MissingKeywords,
                    tailoredCv.CreatedAt));
    }

    public async Task<IReadOnlyList<ApplicationCategoryDto>> GetCategoriesAsync(
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        EnsureUserId(userId);
        var categories = await categoryRepository.GetAllByUserIdAsync(userId, cancellationToken);
        return categories
            .Select(category => new ApplicationCategoryDto(
                category.Id,
                category.UserId,
                category.Name,
                category.CreatedAt))
            .ToArray();
    }

    private async Task<ApplicationDraft> GetRequiredDraftAsync(
        Guid id,
        CancellationToken cancellationToken)
    {
        var draft = await draftRepository.GetByIdAsync(
            id,
            asTracking: true,
            cancellationToken);
        if (draft is null)
        {
            throw new ApplicationWorkflowException("The application draft was not found.", 404);
        }

        if (draft.IsComplete)
        {
            throw new ApplicationWorkflowException("The application draft has already been logged.", 409);
        }

        return draft;
    }

    private async Task<(MasterCv Entity, MasterCvContentDto Content)> GetDraftCvAsync(
        ApplicationDraft draft,
        CancellationToken cancellationToken)
    {
        if (!draft.MasterCvId.HasValue)
        {
            throw new ApplicationWorkflowException("Select a saved CV first.", 409);
        }

        var cv = await masterCvRepository.GetByIdAsync(
            draft.MasterCvId.Value,
            cancellationToken: cancellationToken)
            ?? throw new ApplicationWorkflowException("The selected CV was not found.", 404);
        if (cv.UserId != draft.UserId)
        {
            throw new ApplicationWorkflowException("The selected CV does not belong to this user.", 403);
        }

        return (cv, DeserializeContent(cv.Content));
    }

    private async Task<ApplicationCategory> ResolveCategoryAsync(
        Guid userId,
        LogApplicationDraftRequest request,
        CancellationToken cancellationToken)
    {
        if (request.CategoryId.HasValue)
        {
            var category = await categoryRepository.GetByIdAsync(
                request.CategoryId.Value,
                cancellationToken)
                ?? throw new ApplicationWorkflowException("The selected category was not found.", 404);
            if (category.UserId != userId)
            {
                throw new ApplicationWorkflowException(
                    "The selected category does not belong to this user.",
                    403);
            }

            return category;
        }

        var name = string.IsNullOrWhiteSpace(request.NewCategoryName)
            ? UncategorizedName
            : request.NewCategoryName.Trim();
        var existing = await categoryRepository.GetByNameAsync(userId, name, cancellationToken);
        if (existing is not null)
        {
            return existing;
        }

        var created = ApplicationCategory.Create(userId, name);
        await categoryRepository.AddAsync(created, cancellationToken);
        return created;
    }

    private static MasterCvContentDto DeserializeContent(string content)
    {
        try
        {
            return JsonSerializer.Deserialize<MasterCvContentDto>(content, JsonOptions)
                ?? throw new JsonException("The CV content is empty.");
        }
        catch (JsonException exception)
        {
            throw new ApplicationWorkflowException(
                "The selected CV contains invalid structured data. Import it again.",
                409,
                exception);
        }
    }

    private static string RequireDescription(ApplicationDraft draft) =>
        !string.IsNullOrWhiteSpace(draft.JobDescription)
            ? draft.JobDescription
            : throw new ApplicationWorkflowException("Complete the source stage first.", 409);

    private static void ValidateGrounding(
        MasterCvContentDto source,
        MasterCvContentDto tailored)
    {
        if (!SameText(source.FullName, tailored.FullName) ||
            !SameText(source.Headline, tailored.Headline) ||
            !SameText(source.Email, tailored.Email) ||
            !SameText(source.Phone, tailored.Phone) ||
            !SameText(source.Location, tailored.Location) ||
            !SameText(source.LinkedIn, tailored.LinkedIn) ||
            !SameText(source.Website, tailored.Website))
        {
            throw new ApplicationWorkflowException(
                "The generated CV changed factual personal information. Nothing was saved.",
                502);
        }

        if (!SameValues(source.Skills, tailored.Skills) ||
            !SameValues(source.Certifications, tailored.Certifications) ||
            !SameValues(source.Languages, tailored.Languages))
        {
            throw new ApplicationWorkflowException(
                "The generated CV introduced or removed a factual skill, certification, or language. Nothing was saved.",
                502);
        }

        if (tailored.WorkExperience.Count != source.WorkExperience.Count)
        {
            throw new ApplicationWorkflowException(
                "The generated CV changed the factual work history. Nothing was saved.",
                502);
        }

        for (var index = 0; index < source.WorkExperience.Count; index++)
        {
            var original = source.WorkExperience[index];
            var generated = tailored.WorkExperience[index];
            if (!SameText(original.Company, generated.Company) ||
                !SameText(original.JobTitle, generated.JobTitle) ||
                !SameText(original.StartDate, generated.StartDate) ||
                !SameText(original.EndDate, generated.EndDate) ||
                !SameText(original.Location, generated.Location) ||
                generated.BulletPoints.Count != original.BulletPoints.Count ||
                generated.BulletPoints.Any(string.IsNullOrWhiteSpace))
            {
                throw new ApplicationWorkflowException(
                    "The generated CV changed factual employment history. Nothing was saved.",
                    502);
            }
        }

        if (tailored.Projects.Count != source.Projects.Count)
        {
            throw new ApplicationWorkflowException(
                "The generated CV changed the factual project history. Nothing was saved.",
                502);
        }

        for (var index = 0; index < source.Projects.Count; index++)
        {
            var original = source.Projects[index];
            var generated = tailored.Projects[index];
            if (!SameText(original.Name, generated.Name) ||
                !SameText(original.Role, generated.Role) ||
                !SameText(original.StartDate, generated.StartDate) ||
                !SameText(original.EndDate, generated.EndDate) ||
                !SameText(original.Url, generated.Url) ||
                !SameValues(original.Technologies, generated.Technologies) ||
                generated.BulletPoints.Count != original.BulletPoints.Count ||
                generated.BulletPoints.Any(string.IsNullOrWhiteSpace))
            {
                throw new ApplicationWorkflowException(
                    "The generated CV changed factual project information. Nothing was saved.",
                    502);
            }
        }

        if (tailored.Education.Count != source.Education.Count)
        {
            throw new ApplicationWorkflowException(
                "The generated CV changed the factual education history. Nothing was saved.",
                502);
        }

        for (var index = 0; index < source.Education.Count; index++)
        {
            var original = source.Education[index];
            var generated = tailored.Education[index];
            if (!SameText(original.Institution, generated.Institution) ||
                !SameText(original.Qualification, generated.Qualification) ||
                !SameText(original.StartDate, generated.StartDate) ||
                !SameText(original.EndDate, generated.EndDate) ||
                !SameText(original.Location, generated.Location) ||
                !original.Details.SequenceEqual(
                    generated.Details,
                    StringComparer.OrdinalIgnoreCase))
            {
                throw new ApplicationWorkflowException(
                    "The generated CV changed factual education history. Nothing was saved.",
                    502);
            }
        }

        if (tailored.Courses.Count != source.Courses.Count)
        {
            throw new ApplicationWorkflowException(
                "The generated CV changed factual course information. Nothing was saved.",
                502);
        }

        for (var index = 0; index < source.Courses.Count; index++)
        {
            var original = source.Courses[index];
            var generated = tailored.Courses[index];
            if (!SameText(original.Name, generated.Name) ||
                !SameText(original.Provider, generated.Provider) ||
                !SameText(original.CompletedDate, generated.CompletedDate) ||
                !original.Details.SequenceEqual(
                    generated.Details,
                    StringComparer.OrdinalIgnoreCase))
            {
                throw new ApplicationWorkflowException(
                    "The generated CV changed factual course information. Nothing was saved.",
                    502);
            }
        }
    }

    private static bool SameText(string? first, string? second) =>
        string.Equals(
            first?.Trim(),
            second?.Trim(),
            StringComparison.OrdinalIgnoreCase);

    private static bool SameValues(
        IReadOnlyCollection<string> first,
        IReadOnlyCollection<string> second) =>
        first.Count == second.Count &&
        first.ToHashSet(StringComparer.OrdinalIgnoreCase)
            .SetEquals(second);

    private static ApplicationDraftDto ToDto(ApplicationDraft draft) =>
        new(
            draft.Id,
            draft.UserId,
            draft.MasterCvId,
            draft.JobUrl,
            draft.JobTitle,
            draft.Company,
            draft.JobDescription,
            draft.Location,
            draft.OriginalAtsScore,
            draft.OriginalMatchedKeywords,
            draft.OriginalMissingKeywords,
            draft.AtsExplanation,
            draft.TailoredAtsScore,
            draft.TailoredMatchedKeywords,
            draft.TailoredMissingKeywords,
            draft.TailoredPdfFileName,
            draft.InterviewQuestions,
            draft.InterviewQuestionsPdfFileName,
            draft.CreatedAt,
            draft.UpdatedAt);

    private static void EnsureUserId(Guid userId)
    {
        if (userId == Guid.Empty)
        {
            throw new ArgumentException("A user identifier is required.", nameof(userId));
        }
    }
}
