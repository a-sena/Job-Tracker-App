using System.Security.Claims;
using JobTracker.Application.Authentication;

namespace JobTracker.Api.Authentication;

internal sealed class HttpCurrentUser(IHttpContextAccessor httpContextAccessor) : ICurrentUser
{
    public Guid UserId
    {
        get
        {
            var value = httpContextAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier);
            return Guid.TryParse(value, out var userId)
                ? userId
                : throw new UnauthorizedAccessException("An authenticated user is required.");
        }
    }

    public void EnsureOwns(Guid userId)
    {
        if (userId == Guid.Empty || userId != UserId)
        {
            throw new UnauthorizedAccessException("You do not have access to this resource.");
        }
    }
}
