using JobTracker.Domain.Entities;

namespace JobTracker.Application.Abstractions.Persistence;

public interface IApplicationCategoryRepository
{
    Task<IReadOnlyList<ApplicationCategory>> GetAllByUserIdAsync(
        Guid userId,
        CancellationToken cancellationToken = default);

    Task<ApplicationCategory?> GetByIdAsync(
        Guid id,
        CancellationToken cancellationToken = default);

    Task<ApplicationCategory?> GetByNameAsync(
        Guid userId,
        string name,
        CancellationToken cancellationToken = default);

    Task AddAsync(ApplicationCategory category, CancellationToken cancellationToken = default);
}
