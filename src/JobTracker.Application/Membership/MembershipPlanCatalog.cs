namespace JobTracker.Application.Membership;

public static class MembershipPlanCatalog
{
    public const string FreePlanId = "Free";
    public const string FoundingPlanId = "FoundingMember";
    public const string StandardPlanId = "Standard";
    public const int FreeFeatureLimit = 1;
    public const int PaidMonthlyAiActionLimit = 40;

    public static IReadOnlyList<MembershipPlanDto> GetPlans() =>
    [
        new(
            FreePlanId,
            "Free",
            "Start without a card",
            0,
            0,
            null,
            null,
            "USD",
            true,
            [
                "Unlimited manual application tracking",
                "One lifetime CV match review",
                "One lifetime AI-tailored CV",
                "One interview preparation set",
                "One cover letter"
            ]),
        new(
            FoundingPlanId,
            "Founding Member",
            "Early-access price",
            8,
            80,
            10,
            100,
            "USD",
            false,
            [
                "40 AI actions every month",
                "Unlimited saved CVs and applications",
                "CV review, tailoring and interview preparation",
                "Founding price retained while membership stays active",
                "Cancel any time"
            ])
    ];
}
