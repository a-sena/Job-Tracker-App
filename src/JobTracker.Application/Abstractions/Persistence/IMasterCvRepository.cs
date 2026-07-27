using JobTracker.Domain.Entities;

namespace JobTracker.Application.Abstractions.Persistence;

public interface IMasterCvRepository
{
    Task<MasterCv?> GetByUserIdAsync(
        Guid userId,
        bool asTracking = false,
        CancellationToken cancellationToken = default);

    Task AddAsync(MasterCv masterCv, CancellationToken cancellationToken = default);

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
