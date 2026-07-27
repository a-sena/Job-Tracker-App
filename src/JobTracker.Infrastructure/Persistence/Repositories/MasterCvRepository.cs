using JobTracker.Application.Abstractions.Persistence;
using JobTracker.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace JobTracker.Infrastructure.Persistence.Repositories;

internal sealed class MasterCvRepository(JobTrackerDbContext dbContext)
    : IMasterCvRepository
{
    public async Task<MasterCv?> GetByUserIdAsync(
        Guid userId,
        bool asTracking = false,
        CancellationToken cancellationToken = default)
    {
        IQueryable<MasterCv> query = dbContext.MasterCvs;

        if (!asTracking)
        {
            query = query.AsNoTracking();
        }

        return await query
            .OrderByDescending(masterCv => masterCv.UpdatedAt)
            .FirstOrDefaultAsync(masterCv => masterCv.UserId == userId, cancellationToken);
    }

    public async Task AddAsync(
        MasterCv masterCv,
        CancellationToken cancellationToken = default) =>
        await dbContext.MasterCvs.AddAsync(masterCv, cancellationToken);

    public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default) =>
        dbContext.SaveChangesAsync(cancellationToken);
}
