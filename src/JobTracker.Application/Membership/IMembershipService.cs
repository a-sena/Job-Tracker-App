namespace JobTracker.Application.Membership;

public interface IMembershipService
{
    Task<MembershipDashboardDto> GetDashboardAsync(
        CancellationToken cancellationToken = default);

    Task<AiUsageReservation> ReserveAiActionAsync(
        AiFeature feature,
        CancellationToken cancellationToken = default);

    Task ReleaseAiActionAsync(
        AiUsageReservation reservation,
        CancellationToken cancellationToken = default);
}
