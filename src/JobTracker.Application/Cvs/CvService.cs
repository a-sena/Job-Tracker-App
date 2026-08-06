using System.Text.Json;
using JobTracker.Application.Abstractions.Persistence;
using JobTracker.Application.Authentication;
using JobTracker.Application.Cvs.Dtos;
using JobTracker.Domain.Entities;

namespace JobTracker.Application.Cvs;

internal sealed class CvService(
    IMasterCvRepository masterCvRepository,
    ITailoredCvRepository tailoredCvRepository,
    IJobApplicationRepository jobApplicationRepository,
    IMasterCvImportGateway masterCvImportGateway,
    ICvTailoringGateway tailoringGateway,
    ICurrentUser currentUser) : ICvService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public Task<ImportedMasterCvDto> ImportPdfAsync(
        byte[] pdfContent,
        string fileName,
        string contentType,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(pdfContent);

        if (pdfContent.Length == 0)
        {
            throw new CvWorkflowException("The uploaded PDF is empty.", 400);
        }

        return masterCvImportGateway.ImportPdfAsync(
            pdfContent,
            fileName,
            contentType,
            cancellationToken);
    }

    public async Task<MasterCvDto?> GetMasterCvAsync(
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        currentUser.EnsureOwns(userId);
        var masterCv = await masterCvRepository.GetByUserIdAsync(
            userId,
            cancellationToken: cancellationToken);

        return masterCv is null ? null : ToDto(masterCv);
    }

    public async Task<MasterCvDto> UpsertMasterCvAsync(
        Guid userId,
        UpsertMasterCvRequest request,
        CancellationToken cancellationToken = default)
    {
        currentUser.EnsureOwns(userId);
        ArgumentNullException.ThrowIfNull(request);

        var content = JsonSerializer.Serialize(request.Content, JsonOptions);
        var masterCv = await masterCvRepository.GetByUserIdAsync(
            userId,
            asTracking: true,
            cancellationToken);

        if (masterCv is null)
        {
            masterCv = MasterCv.Create(
                userId,
                request.Name,
                content,
                originalPdf: null,
                originalFileName: null,
                isDefault: true);
            await masterCvRepository.AddAsync(masterCv, cancellationToken);
        }
        else
        {
            masterCv.Update(request.Name, content);
        }

        await masterCvRepository.SaveChangesAsync(cancellationToken);
        return ToDto(masterCv);
    }

    public async Task<TailoredCvDto> GenerateTailoredCvAsync(
        Guid jobApplicationId,
        CancellationToken cancellationToken = default)
    {
        var jobApplication = await jobApplicationRepository.GetByIdAsync(
            jobApplicationId,
            cancellationToken: cancellationToken)
            ?? throw new CvWorkflowException("The job application was not found.", 404);
        if (jobApplication.UserId != currentUser.UserId)
        {
            throw new CvWorkflowException("The job application was not found.", 404);
        }

        var masterCv = await masterCvRepository.GetByUserIdAsync(
            jobApplication.UserId,
            cancellationToken: cancellationToken)
            ?? throw new CvWorkflowException(
                "Save a Master CV before generating a tailored CV.",
                409);

        var masterContent = DeserializeContent(masterCv.Content);
        var generated = await tailoringGateway.GenerateAsync(
            masterContent,
            jobApplication.Description,
            null,
            cancellationToken);

        var tailoredContent = JsonSerializer.Serialize(
            generated.TailoredContent,
            JsonOptions);

        var tailoredCv = TailoredCv.Create(
            masterCv.Id,
            jobApplication.Id,
            generated.TailoredContent.ProfessionalSummary,
            tailoredContent,
            generated.AtsMatchScore,
            generated.MissingKeywords,
            generated.PdfContent,
            generated.PdfFileName);

        await tailoredCvRepository.AddAsync(tailoredCv, cancellationToken);
        await tailoredCvRepository.SaveChangesAsync(cancellationToken);

        return ToDto(tailoredCv);
    }

    public async Task<TailoredCvDto?> GetLatestTailoredCvAsync(
        Guid jobApplicationId,
        CancellationToken cancellationToken = default)
    {
        if (!await OwnsJobAsync(jobApplicationId, cancellationToken))
        {
            return null;
        }

        var tailoredCv = await tailoredCvRepository.GetLatestByJobIdAsync(
            jobApplicationId,
            cancellationToken);

        return tailoredCv is null ? null : ToDto(tailoredCv);
    }

    public async Task<TailoredCvPdfDto?> GetLatestPdfAsync(
        Guid jobApplicationId,
        CancellationToken cancellationToken = default)
    {
        if (!await OwnsJobAsync(jobApplicationId, cancellationToken))
        {
            return null;
        }

        var tailoredCv = await tailoredCvRepository.GetLatestByJobIdAsync(
            jobApplicationId,
            cancellationToken);

        return tailoredCv is null
            ? null
            : new TailoredCvPdfDto(
                tailoredCv.PdfContent.ToArray(),
                tailoredCv.PdfFileName);
    }

    private static MasterCvDto ToDto(MasterCv masterCv) =>
        new(
            masterCv.Id,
            masterCv.UserId,
            masterCv.Name,
            DeserializeContent(masterCv.Content),
            masterCv.CreatedAt,
            masterCv.UpdatedAt);

    private static TailoredCvDto ToDto(TailoredCv tailoredCv) =>
        new(
            tailoredCv.Id,
            tailoredCv.MasterCvId,
            tailoredCv.JobApplicationId,
            tailoredCv.Summary,
            tailoredCv.AtsMatchScore,
            tailoredCv.MissingKeywords,
            tailoredCv.PdfFileName,
            tailoredCv.CreatedAt,
            tailoredCv.UpdatedAt);

    private static MasterCvContentDto DeserializeContent(string content)
    {
        try
        {
            return JsonSerializer.Deserialize<MasterCvContentDto>(content, JsonOptions)
                ?? throw new JsonException("The CV document is empty.");
        }
        catch (JsonException exception)
        {
            throw new CvWorkflowException(
                "The stored Master CV is invalid. Save it again before tailoring.",
                409,
                exception);
        }
    }

    private async Task<bool> OwnsJobAsync(
        Guid jobApplicationId,
        CancellationToken cancellationToken)
    {
        var job = await jobApplicationRepository.GetByIdAsync(
            jobApplicationId,
            cancellationToken: cancellationToken);
        return job is not null && job.UserId == currentUser.UserId;
    }
}
