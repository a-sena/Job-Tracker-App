using Microsoft.AspNetCore.Identity;

namespace JobTracker.Infrastructure.Identity;

public sealed class AppUser : IdentityUser<Guid>
{
    public string MembershipPlan { get; set; } = "Free";

    public string MembershipStatus { get; set; } = "Active";

    public DateTimeOffset? MembershipStartedAt { get; set; }

    public DateTimeOffset? MembershipRenewsAt { get; set; }

    public string? StripeCustomerId { get; set; }

    public string? StripeSubscriptionId { get; set; }

    public string? StripePriceId { get; set; }

    public string? StripeLastEventId { get; set; }

    public DateTimeOffset? StripeLastEventCreatedAt { get; set; }

    public DateTimeOffset? AiUsagePeriodStartedAt { get; set; }

    public int AiActionsUsed { get; set; }

    public int FreeCvReviewsUsed { get; set; }

    public int FreeCvTailorsUsed { get; set; }

    public int FreeInterviewSetsUsed { get; set; }

    public int FreeCoverLettersUsed { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
