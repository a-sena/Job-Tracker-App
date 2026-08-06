namespace JobTracker.Application.Membership;

public sealed class MembershipLimitException(string message) : Exception(message);
