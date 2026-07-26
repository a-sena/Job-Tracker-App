using JobTracker.Application.Jobs.Dtos;

namespace JobTracker.Application.Jobs;

public interface IJobExtractionService
{
    Task<ExtractedJobDto> ExtractAsync(
        ExtractJobRequest request,
        CancellationToken cancellationToken = default);
}
