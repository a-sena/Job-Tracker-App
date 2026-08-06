using JobTracker.Application.Authentication;
using JobTracker.Application.Membership;
using JobTracker.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace JobTracker.Infrastructure.Identity;

internal sealed class MembershipService(
    JobTrackerDbContext dbContext,
    IBillingService billingService,
    ICurrentUser currentUser) : IMembershipService
{
    public async Task<MembershipDashboardDto> GetDashboardAsync(
        CancellationToken cancellationToken = default)
    {
        var user = await GetCurrentUserAsync(cancellationToken);
        var planId = NormalizePlan(user.MembershipPlan);
        var changed = ResetPaidPeriodWhenNeeded(user, planId);
        if (changed)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return new MembershipDashboardDto(
            planId,
            planId == MembershipPlanCatalog.FreePlanId ? "Free" :
                planId == MembershipPlanCatalog.FoundingPlanId ? "Founding Member" : "Standard",
            string.IsNullOrWhiteSpace(user.MembershipStatus) ? "Active" : user.MembershipStatus,
            user.MembershipRenewsAt,
            billingService.IsConfigured,
            billingService.IsConfigured && !string.IsNullOrWhiteSpace(user.StripeCustomerId),
            BuildAllowances(user, planId),
            MembershipPlanCatalog.GetPlans()
                .Select(plan => plan.Id == MembershipPlanCatalog.FoundingPlanId
                    ? plan with { IsAvailable = billingService.IsConfigured }
                    : plan)
                .ToArray());
    }

    public async Task<AiUsageReservation> ReserveAiActionAsync(
        AiFeature feature,
        CancellationToken cancellationToken = default)
    {
        var user = await GetCurrentUserAsync(cancellationToken);
        var planId = NormalizePlan(user.MembershipPlan);

        if (planId == MembershipPlanCatalog.FreePlanId)
        {
            var used = GetFreeUsage(user, feature);
            if (used >= MembershipPlanCatalog.FreeFeatureLimit)
            {
                throw new MembershipLimitException(
                    $"Your free {FeatureLabel(feature)} has already been used. " +
                    "Open Membership from your profile to view the Founding Member plan.");
            }

            SetFreeUsage(user, feature, used + 1);
        }
        else
        {
            ResetPaidPeriodWhenNeeded(user, planId);
            if (user.AiActionsUsed >= MembershipPlanCatalog.PaidMonthlyAiActionLimit)
            {
                throw new MembershipLimitException(
                    "Your monthly AI allowance has been used. It will reset at the beginning of your next usage period.");
            }

            user.AiActionsUsed++;
        }

        user.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return new AiUsageReservation(user.Id, feature, planId, DateTimeOffset.UtcNow);
    }

    public async Task ReleaseAiActionAsync(
        AiUsageReservation reservation,
        CancellationToken cancellationToken = default)
    {
        if (reservation.UserId != currentUser.UserId)
        {
            return;
        }

        var user = await dbContext.Users.SingleOrDefaultAsync(
            candidate => candidate.Id == reservation.UserId,
            cancellationToken);
        if (user is null)
        {
            return;
        }

        if (reservation.PlanId == MembershipPlanCatalog.FreePlanId)
        {
            var used = GetFreeUsage(user, reservation.Feature);
            SetFreeUsage(user, reservation.Feature, Math.Max(0, used - 1));
        }
        else if (user.AiUsagePeriodStartedAt <= reservation.ReservedAt)
        {
            user.AiActionsUsed = Math.Max(0, user.AiActionsUsed - 1);
        }

        user.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task<AppUser> GetCurrentUserAsync(CancellationToken cancellationToken) =>
        await dbContext.Users.SingleOrDefaultAsync(
            user => user.Id == currentUser.UserId,
            cancellationToken)
        ?? throw new InvalidOperationException("The signed-in user account was not found.");

    private static string NormalizePlan(string? plan) => plan switch
    {
        MembershipPlanCatalog.FoundingPlanId => MembershipPlanCatalog.FoundingPlanId,
        MembershipPlanCatalog.StandardPlanId => MembershipPlanCatalog.StandardPlanId,
        _ => MembershipPlanCatalog.FreePlanId
    };

    private static bool ResetPaidPeriodWhenNeeded(AppUser user, string planId)
    {
        if (planId == MembershipPlanCatalog.FreePlanId)
        {
            return false;
        }

        var now = DateTimeOffset.UtcNow;
        var periodStart = new DateTimeOffset(now.Year, now.Month, 1, 0, 0, 0, TimeSpan.Zero);
        if (user.AiUsagePeriodStartedAt >= periodStart)
        {
            return false;
        }

        user.AiUsagePeriodStartedAt = periodStart;
        user.AiActionsUsed = 0;
        user.UpdatedAt = now;
        return true;
    }

    private static IReadOnlyList<MembershipAllowanceDto> BuildAllowances(
        AppUser user,
        string planId)
    {
        if (planId != MembershipPlanCatalog.FreePlanId)
        {
            return
            [
                new(
                    "ai-actions",
                    "AI actions",
                    user.AiActionsUsed,
                    MembershipPlanCatalog.PaidMonthlyAiActionLimit,
                    "Monthly")
            ];
        }

        return
        [
            new("cv-review", "CV match review", user.FreeCvReviewsUsed, 1, "Lifetime"),
            new("cv-tailoring", "AI-tailored CV", user.FreeCvTailorsUsed, 1, "Lifetime"),
            new("interview-questions", "Interview preparation", user.FreeInterviewSetsUsed, 1, "Lifetime"),
            new("cover-letter", "Cover letter", user.FreeCoverLettersUsed, 1, "Lifetime")
        ];
    }

    private static int GetFreeUsage(AppUser user, AiFeature feature) => feature switch
    {
        AiFeature.CvReview => user.FreeCvReviewsUsed,
        AiFeature.CvTailoring => user.FreeCvTailorsUsed,
        AiFeature.InterviewQuestions => user.FreeInterviewSetsUsed,
        AiFeature.CoverLetter => user.FreeCoverLettersUsed,
        _ => throw new ArgumentOutOfRangeException(nameof(feature), feature, null)
    };

    private static void SetFreeUsage(AppUser user, AiFeature feature, int value)
    {
        switch (feature)
        {
            case AiFeature.CvReview:
                user.FreeCvReviewsUsed = value;
                break;
            case AiFeature.CvTailoring:
                user.FreeCvTailorsUsed = value;
                break;
            case AiFeature.InterviewQuestions:
                user.FreeInterviewSetsUsed = value;
                break;
            case AiFeature.CoverLetter:
                user.FreeCoverLettersUsed = value;
                break;
            default:
                throw new ArgumentOutOfRangeException(nameof(feature), feature, null);
        }
    }

    private static string FeatureLabel(AiFeature feature) => feature switch
    {
        AiFeature.CvReview => "CV match review",
        AiFeature.CvTailoring => "AI-tailored CV",
        AiFeature.InterviewQuestions => "interview preparation set",
        AiFeature.CoverLetter => "cover letter",
        _ => "AI action"
    };
}
