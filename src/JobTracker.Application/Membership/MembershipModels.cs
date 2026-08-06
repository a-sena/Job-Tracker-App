namespace JobTracker.Application.Membership;

public enum AiFeature
{
    CvReview,
    CvTailoring,
    InterviewQuestions,
    CoverLetter
}

public sealed record AiUsageReservation(
    Guid UserId,
    AiFeature Feature,
    string PlanId,
    DateTimeOffset ReservedAt);

public sealed record MembershipAllowanceDto(
    string Id,
    string Label,
    int Used,
    int Limit,
    string Period);

public sealed record MembershipPlanDto(
    string Id,
    string Name,
    string Eyebrow,
    int MonthlyPrice,
    int AnnualPrice,
    int? FutureMonthlyPrice,
    int? FutureAnnualPrice,
    string Currency,
    bool IsAvailable,
    IReadOnlyList<string> Features);

public sealed record MembershipDashboardDto(
    string PlanId,
    string PlanName,
    string Status,
    DateTimeOffset? RenewsAt,
    bool BillingConfigured,
    bool CanManageBilling,
    IReadOnlyList<MembershipAllowanceDto> Allowances,
    IReadOnlyList<MembershipPlanDto> Plans);
