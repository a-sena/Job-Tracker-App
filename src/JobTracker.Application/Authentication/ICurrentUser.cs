namespace JobTracker.Application.Authentication;

public interface ICurrentUser
{
    Guid UserId { get; }

    void EnsureOwns(Guid userId);
}
