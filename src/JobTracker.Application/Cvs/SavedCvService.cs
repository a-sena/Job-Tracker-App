using System.Text.Json;
using JobTracker.Application.Abstractions.Persistence;
using JobTracker.Application.Authentication;
using JobTracker.Application.Cvs.Dtos;
using JobTracker.Domain.Entities;

namespace JobTracker.Application.Cvs;

internal sealed class SavedCvService(
    IMasterCvRepository masterCvRepository,
    IMasterCvImportGateway importGateway,
    ICurrentUser currentUser) : ISavedCvService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<IReadOnlyList<SavedCvDto>> GetAllAsync(
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        currentUser.EnsureOwns(userId);
        var cvs = await masterCvRepository.GetAllByUserIdAsync(userId, cancellationToken: cancellationToken);
        return cvs.Select(ToDto).ToArray();
    }

    public async Task<SavedCvDto> ImportPdfAsync(
        Guid userId,
        string? name,
        byte[] pdfContent,
        string fileName,
        string contentType,
        CancellationToken cancellationToken = default)
    {
        currentUser.EnsureOwns(userId);
        ArgumentNullException.ThrowIfNull(pdfContent);
        if (pdfContent.Length == 0)
        {
            throw new CvWorkflowException("The uploaded PDF is empty.", 400);
        }

        if (pdfContent.Length < 5 ||
            pdfContent[0] != (byte)'%' ||
            pdfContent[1] != (byte)'P' ||
            pdfContent[2] != (byte)'D' ||
            pdfContent[3] != (byte)'F' ||
            pdfContent[4] != (byte)'-')
        {
            throw new CvWorkflowException("The uploaded file is not a valid PDF.", 415);
        }

        var imported = await importGateway.ImportPdfAsync(
            pdfContent,
            fileName,
            contentType,
            cancellationToken);
        var existing = await masterCvRepository.GetAllByUserIdAsync(
            userId,
            asTracking: true,
            cancellationToken);
        var cvName = string.IsNullOrWhiteSpace(name)
            ? Path.GetFileNameWithoutExtension(fileName)
            : name.Trim();
        if (cvName.Length > 150)
        {
            throw new CvWorkflowException("The CV name cannot exceed 150 characters.", 400);
        }

        var masterCv = MasterCv.Create(
            userId,
            cvName,
            JsonSerializer.Serialize(imported.Content, JsonOptions),
            pdfContent,
            Path.GetFileName(fileName),
            existing.Count == 0);
        await masterCvRepository.AddAsync(masterCv, cancellationToken);
        await masterCvRepository.SaveChangesAsync(cancellationToken);
        return ToDto(masterCv);
    }

    public async Task<SavedCvDto?> RenameAsync(
        Guid id,
        string name,
        CancellationToken cancellationToken = default)
    {
        var cv = await masterCvRepository.GetByIdAsync(id, asTracking: true, cancellationToken);
        if (cv is null || cv.UserId != currentUser.UserId)
        {
            return null;
        }

        cv.Rename(name);
        await masterCvRepository.SaveChangesAsync(cancellationToken);
        return ToDto(cv);
    }

    public async Task<SavedCvDto?> SetDefaultAsync(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        var existing = await masterCvRepository.GetByIdAsync(id, cancellationToken: cancellationToken);
        if (existing is null || existing.UserId != currentUser.UserId)
        {
            return null;
        }

        var selected = await masterCvRepository.SetDefaultAsync(id, cancellationToken);
        return selected is null ? null : ToDto(selected);
    }

    public async Task<bool> DeleteAsync(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        var cv = await masterCvRepository.GetByIdAsync(id, asTracking: true, cancellationToken);
        if (cv is null || cv.UserId != currentUser.UserId)
        {
            return false;
        }

        if (await masterCvRepository.IsInUseAsync(id, cancellationToken))
        {
            throw new CvWorkflowException(
                "This CV is used by an application draft or logged application and cannot be deleted.",
                409);
        }

        var wasDefault = cv.IsDefault;
        var userId = cv.UserId;
        masterCvRepository.Remove(cv);
        if (wasDefault)
        {
            var remaining = (await masterCvRepository.GetAllByUserIdAsync(
                userId,
                asTracking: true,
                cancellationToken))
                .Where(other => other.Id != id)
                .ToArray();
            remaining.FirstOrDefault()?.SetDefault(true);
        }

        await masterCvRepository.SaveChangesAsync(cancellationToken);
        return true;
    }

    private static SavedCvDto ToDto(MasterCv cv) =>
        new(cv.Id, cv.UserId, cv.Name, cv.OriginalFileName, cv.IsDefault, cv.CreatedAt, cv.UpdatedAt);

}
