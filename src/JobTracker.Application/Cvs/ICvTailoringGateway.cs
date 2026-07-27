using JobTracker.Application.Cvs.Dtos;

namespace JobTracker.Application.Cvs;

public interface ICvTailoringGateway
{
    Task<GeneratedTailoredCvPackage> GenerateAsync(
        MasterCvContentDto masterCv,
        string jobDescription,
        CancellationToken cancellationToken = default);
}
