using JobTracker.Application.Abstractions.Persistence;
using JobTracker.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace JobTracker.Infrastructure.Persistence.Repositories;

internal sealed class ApplicationCategoryRepository(JobTrackerDbContext dbContext)
    : IApplicationCategoryRepository
{
    public async Task<IReadOnlyList<ApplicationCategory>> GetAllByUserIdAsync(
        Guid userId,
        CancellationToken cancellationToken = default) =>
        await dbContext.ApplicationCategories
            .AsNoTracking()
            .Where(category => category.UserId == userId)
            .OrderBy(category => category.Name)
            .ToListAsync(cancellationToken);

    public Task<ApplicationCategory?> GetByIdAsync(
        Guid id,
        CancellationToken cancellationToken = default) =>
        dbContext.ApplicationCategories
            .SingleOrDefaultAsync(category => category.Id == id, cancellationToken);

    public Task<ApplicationCategory?> GetByNameAsync(
        Guid userId,
        string name,
        CancellationToken cancellationToken = default) =>
        dbContext.ApplicationCategories
            .SingleOrDefaultAsync(
                category => category.UserId == userId &&
                    EF.Functions.ILike(category.Name, name),
                cancellationToken);

    public async Task AddAsync(
        ApplicationCategory category,
        CancellationToken cancellationToken = default) =>
        await dbContext.ApplicationCategories.AddAsync(category, cancellationToken);
}
