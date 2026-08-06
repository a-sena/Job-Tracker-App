using JobTracker.Application.Membership;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JobTracker.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/membership")]
[Produces("application/json")]
public sealed class MembershipController(IMembershipService membershipService) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<MembershipDashboardDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<MembershipDashboardDto>> Get(
        CancellationToken cancellationToken) =>
        Ok(await membershipService.GetDashboardAsync(cancellationToken));
}
