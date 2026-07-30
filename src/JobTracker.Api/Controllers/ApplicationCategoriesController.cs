using JobTracker.Application.ApplicationWorkflow;
using JobTracker.Application.ApplicationWorkflow.Dtos;
using Microsoft.AspNetCore.Mvc;

namespace JobTracker.Api.Controllers;

[ApiController]
[Route("api/application-categories")]
[Produces("application/json")]
public sealed class ApplicationCategoriesController(
    IApplicationWorkflowService workflowService) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<ApplicationCategoryDto>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<ApplicationCategoryDto>>> GetAll(
        [FromQuery] Guid userId,
        CancellationToken cancellationToken)
    {
        if (userId == Guid.Empty)
        {
            ModelState.AddModelError(nameof(userId), "A user identifier is required.");
            return ValidationProblem(ModelState);
        }

        return Ok(await workflowService.GetCategoriesAsync(userId, cancellationToken));
    }
}
