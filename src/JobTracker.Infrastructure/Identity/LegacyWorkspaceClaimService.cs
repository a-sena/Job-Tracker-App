using JobTracker.Application.Authentication;
using JobTracker.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace JobTracker.Infrastructure.Identity;

internal sealed class LegacyWorkspaceClaimService(JobTrackerDbContext dbContext)
    : ILegacyWorkspaceClaimService
{
    public async Task ClaimAsync(
        Guid legacyUserId,
        Guid authenticatedUserId,
        CancellationToken cancellationToken = default)
    {
        if (legacyUserId == Guid.Empty || legacyUserId == authenticatedUserId)
        {
            return;
        }

        var executionStrategy = dbContext.Database.CreateExecutionStrategy();
        await executionStrategy.ExecuteAsync(async () =>
        {
            await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);

            await dbContext.MasterCvs
                .Where(cv => cv.UserId == legacyUserId)
                .ExecuteUpdateAsync(
                    setters => setters.SetProperty(cv => cv.UserId, authenticatedUserId),
                    cancellationToken);
            await dbContext.JobApplications
                .Where(job => job.UserId == legacyUserId)
                .ExecuteUpdateAsync(
                    setters => setters.SetProperty(job => job.UserId, authenticatedUserId),
                    cancellationToken);
            await dbContext.ApplicationDrafts
                .Where(draft => draft.UserId == legacyUserId)
                .ExecuteUpdateAsync(
                    setters => setters.SetProperty(draft => draft.UserId, authenticatedUserId),
                    cancellationToken);
            await dbContext.ApplicationCategories
                .Where(category => category.UserId == legacyUserId)
                .ExecuteUpdateAsync(
                    setters => setters.SetProperty(category => category.UserId, authenticatedUserId),
                    cancellationToken);

            await transaction.CommitAsync(cancellationToken);
        });
    }
}
