using JobTracker.Domain.Entities;

namespace JobTracker.Application.Abstractions.Persistence;

public interface IMasterCvRepository
{
    Task<MasterCv?> GetByUserIdAsync(
        Guid userId,
        bool asTracking = false,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<MasterCv>> GetAllByUserIdAsync(
        Guid userId,
        bool asTracking = false,
        CancellationToken cancellationToken = default);

    Task<MasterCv?> GetByIdAsync(
        Guid id,
        bool asTracking = false,
        CancellationToken cancellationToken = default);

    Task<MasterCv?> SetDefaultAsync(
        Guid id,
        CancellationToken cancellationToken = default);

    Task<bool> IsInUseAsync(Guid id, CancellationToken cancellationToken = default);

    Task AddAsync(MasterCv masterCv, CancellationToken cancellationToken = default);

    void Remove(MasterCv masterCv);

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
