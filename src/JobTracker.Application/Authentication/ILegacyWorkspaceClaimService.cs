namespace JobTracker.Application.Authentication;

public interface ILegacyWorkspaceClaimService
{
    Task ClaimAsync(
        Guid legacyUserId,
        Guid authenticatedUserId,
        CancellationToken cancellationToken = default);
}
