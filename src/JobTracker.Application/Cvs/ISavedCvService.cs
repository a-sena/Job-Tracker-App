using JobTracker.Application.Cvs.Dtos;

namespace JobTracker.Application.Cvs;

public interface ISavedCvService
{
    Task<IReadOnlyList<SavedCvDto>> GetAllAsync(
        Guid userId,
        CancellationToken cancellationToken = default);

    Task<SavedCvDto> ImportPdfAsync(
        Guid userId,
        string? name,
        byte[] pdfContent,
        string fileName,
        string contentType,
        CancellationToken cancellationToken = default);

    Task<SavedCvDto?> RenameAsync(
        Guid id,
        string name,
        CancellationToken cancellationToken = default);

    Task<SavedCvDto?> SetDefaultAsync(
        Guid id,
        CancellationToken cancellationToken = default);

    Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default);
}
