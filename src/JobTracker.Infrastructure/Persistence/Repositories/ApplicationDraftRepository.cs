using JobTracker.Application.Abstractions.Persistence;
using JobTracker.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace JobTracker.Infrastructure.Persistence.Repositories;

internal sealed class ApplicationDraftRepository(JobTrackerDbContext dbContext)
    : IApplicationDraftRepository
{
    private const string ActiveDraftConstraint = "ux_application_drafts_user_active";

    public async Task<ApplicationDraft> GetOrCreateActiveAsync(
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        var existingDraft = await GetActiveByUserIdAsync(
            userId,
            asTracking: true,
            cancellationToken);
        if (existingDraft is not null)
        {
            return existingDraft;
        }

        var draft = ApplicationDraft.Create(userId);
        await dbContext.ApplicationDrafts.AddAsync(draft, cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            return draft;
        }
        catch (DbUpdateException exception) when (IsActiveDraftConflict(exception))
        {
            // Another request created the user's draft after our initial read.
            // Detach the unsuccessful entity and return the committed winner.
            dbContext.Entry(draft).State = EntityState.Detached;

            return await dbContext.ApplicationDrafts
                .OrderByDescending(candidate => candidate.UpdatedAt)
                .FirstAsync(
                    candidate => candidate.UserId == userId &&
                        candidate.CompletedAt == null,
                    cancellationToken);
        }
    }

    public async Task<ApplicationDraft?> GetActiveByUserIdAsync(
        Guid userId,
        bool asTracking = false,
        CancellationToken cancellationToken = default)
    {
        IQueryable<ApplicationDraft> query = dbContext.ApplicationDrafts;
        if (!asTracking)
        {
            query = query.AsNoTracking();
        }

        return await query
            .OrderByDescending(draft => draft.UpdatedAt)
            .FirstOrDefaultAsync(
                draft => draft.UserId == userId && draft.CompletedAt == null,
                cancellationToken);
    }

    public async Task<ApplicationDraft?> GetByIdAsync(
        Guid id,
        bool asTracking = false,
        CancellationToken cancellationToken = default)
    {
        IQueryable<ApplicationDraft> query = dbContext.ApplicationDrafts;
        if (!asTracking)
        {
            query = query.AsNoTracking();
        }

        return await query.SingleOrDefaultAsync(draft => draft.Id == id, cancellationToken);
    }

    public Task<ApplicationDraft?> GetByLoggedJobApplicationIdAsync(
        Guid jobApplicationId,
        CancellationToken cancellationToken = default) =>
        dbContext.ApplicationDrafts
            .AsNoTracking()
            .SingleOrDefaultAsync(
                draft => draft.LoggedJobApplicationId == jobApplicationId,
                cancellationToken);

    public async Task AddAsync(
        ApplicationDraft draft,
        CancellationToken cancellationToken = default) =>
        await dbContext.ApplicationDrafts.AddAsync(draft, cancellationToken);

    public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default) =>
        dbContext.SaveChangesAsync(cancellationToken);

    private static bool IsActiveDraftConflict(DbUpdateException exception) =>
        exception.InnerException is PostgresException
        {
            SqlState: PostgresErrorCodes.UniqueViolation,
            ConstraintName: ActiveDraftConstraint
        };
}
