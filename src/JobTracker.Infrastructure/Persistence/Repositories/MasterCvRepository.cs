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
            .OrderByDescending(masterCv => masterCv.IsDefault)
            .ThenByDescending(masterCv => masterCv.UpdatedAt)
            .FirstOrDefaultAsync(masterCv => masterCv.UserId == userId, cancellationToken);
    }

    public async Task<IReadOnlyList<MasterCv>> GetAllByUserIdAsync(
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
            .Where(masterCv => masterCv.UserId == userId)
            .OrderByDescending(masterCv => masterCv.IsDefault)
            .ThenByDescending(masterCv => masterCv.UpdatedAt)
            .ToListAsync(cancellationToken);
    }

    public async Task<MasterCv?> GetByIdAsync(
        Guid id,
        bool asTracking = false,
        CancellationToken cancellationToken = default)
    {
        IQueryable<MasterCv> query = dbContext.MasterCvs;
        if (!asTracking)
        {
            query = query.AsNoTracking();
        }

        return await query.SingleOrDefaultAsync(masterCv => masterCv.Id == id, cancellationToken);
    }

    public async Task<MasterCv?> SetDefaultAsync(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        var executionStrategy = dbContext.Database.CreateExecutionStrategy();
        return await executionStrategy.ExecuteAsync(async () =>
        {
            await using var transaction =
                await dbContext.Database.BeginTransactionAsync(cancellationToken);

            var selected = await dbContext.MasterCvs
                .SingleOrDefaultAsync(masterCv => masterCv.Id == id, cancellationToken);
            if (selected is null || selected.IsDefault)
            {
                return selected;
            }

            var currentDefaults = await dbContext.MasterCvs
                .Where(masterCv =>
                    masterCv.UserId == selected.UserId &&
                    masterCv.IsDefault)
                .ToListAsync(cancellationToken);

            foreach (var currentDefault in currentDefaults)
            {
                currentDefault.SetDefault(false);
            }

            // The filtered unique index is non-deferrable, so the previous
            // default must be persisted before the selected CV is promoted.
            await dbContext.SaveChangesAsync(cancellationToken);

            selected.SetDefault(true);
            await dbContext.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            return selected;
        });
    }

    public async Task<bool> IsInUseAsync(
        Guid id,
        CancellationToken cancellationToken = default) =>
        await dbContext.TailoredCvs.AnyAsync(cv => cv.MasterCvId == id, cancellationToken) ||
        await dbContext.ApplicationDrafts.AnyAsync(
            draft => draft.MasterCvId == id,
            cancellationToken);

    public async Task AddAsync(
        MasterCv masterCv,
        CancellationToken cancellationToken = default) =>
        await dbContext.MasterCvs.AddAsync(masterCv, cancellationToken);

    public void Remove(MasterCv masterCv) => dbContext.MasterCvs.Remove(masterCv);

    public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default) =>
        dbContext.SaveChangesAsync(cancellationToken);
}
