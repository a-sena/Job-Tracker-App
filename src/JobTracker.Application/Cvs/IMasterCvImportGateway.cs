using JobTracker.Application.Cvs.Dtos;

namespace JobTracker.Application.Cvs;

public interface IMasterCvImportGateway
{
    Task<ImportedMasterCvDto> ImportPdfAsync(
        byte[] pdfContent,
        string fileName,
        string contentType,
        CancellationToken cancellationToken = default);
}
