using JobTracker.Application.Cvs.Dtos;
using JobTracker.Domain.Entities;

namespace JobTracker.Application.Abstractions.Persistence;

public interface ITailoredCvRepository
{
    Task<TailoredCv?> GetLatestByJobIdAsync(
        Guid jobApplicationId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyDictionary<Guid, TailoredCvSummaryDto>> GetLatestSummariesAsync(
        IReadOnlyCollection<Guid> jobApplicationIds,
        CancellationToken cancellationToken = default);

    Task AddAsync(TailoredCv tailoredCv, CancellationToken cancellationToken = default);

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
