using JobTracker.Domain.Entities;

namespace JobTracker.Application.Abstractions.Persistence;

public interface IJobApplicationRepository
{
    Task<IReadOnlyList<JobApplication>> GetAllByUserIdAsync(
        Guid userId,
        CancellationToken cancellationToken = default);

    Task<JobApplication?> GetByIdAsync(
        Guid id,
        bool asTracking = false,
        CancellationToken cancellationToken = default);

    Task AddAsync(JobApplication jobApplication, CancellationToken cancellationToken = default);

    void Remove(JobApplication jobApplication);

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
