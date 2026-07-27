using JobTracker.Application.Cvs.Dtos;

namespace JobTracker.Application.Cvs;

public interface ICvService
{
    Task<ImportedMasterCvDto> ImportPdfAsync(
        byte[] pdfContent,
        string fileName,
        string contentType,
        CancellationToken cancellationToken = default);

    Task<MasterCvDto?> GetMasterCvAsync(
        Guid userId,
        CancellationToken cancellationToken = default);

    Task<MasterCvDto> UpsertMasterCvAsync(
        Guid userId,
        UpsertMasterCvRequest request,
        CancellationToken cancellationToken = default);

    Task<TailoredCvDto> GenerateTailoredCvAsync(
        Guid jobApplicationId,
        CancellationToken cancellationToken = default);

    Task<TailoredCvDto?> GetLatestTailoredCvAsync(
        Guid jobApplicationId,
        CancellationToken cancellationToken = default);

    Task<TailoredCvPdfDto?> GetLatestPdfAsync(
        Guid jobApplicationId,
        CancellationToken cancellationToken = default);
}
