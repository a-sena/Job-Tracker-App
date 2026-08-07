using JobTracker.Application.ApplicationWorkflow;
using JobTracker.Application.ApplicationWorkflow.Dtos;
using Microsoft.AspNetCore.Authorization;
using JobTracker.Application.Cvs;
using JobTracker.Application.Jobs.Dtos;
using JobTracker.Application.Membership;
using Microsoft.AspNetCore.Mvc;

namespace JobTracker.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/application-workflow")]
[Produces("application/json")]
public sealed class ApplicationWorkflowController(
    IApplicationWorkflowService workflowService) : ControllerBase
{
    [HttpGet("logged/{jobApplicationId:guid}")]
    [ProducesResponseType<ApplicationDraftDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ApplicationDraftDto>> GetLoggedDraft(
        Guid jobApplicationId,
        CancellationToken cancellationToken)
    {
        var draft = await workflowService.GetLoggedDraftAsync(
            jobApplicationId,
            cancellationToken);
        return draft is null ? NotFound() : Ok(draft);
    }

    [HttpGet("draft")]
    [ProducesResponseType<ApplicationDraftDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ApplicationDraftDto>> GetActiveDraft(
        [FromQuery] Guid userId,
        CancellationToken cancellationToken)
    {
        if (userId == Guid.Empty)
        {
            ModelState.AddModelError(nameof(userId), "A user identifier is required.");
            return ValidationProblem(ModelState);
        }

        var draft = await workflowService.GetActiveDraftAsync(userId, cancellationToken);
        return draft is null ? NotFound() : Ok(draft);
    }

    [HttpPost("draft")]
    [ProducesResponseType<ApplicationDraftDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<ApplicationDraftDto>> GetOrCreateDraft(
        [FromBody] CreateApplicationDraftRequest request,
        CancellationToken cancellationToken)
    {
        if (request.UserId == Guid.Empty)
        {
            ModelState.AddModelError(nameof(request.UserId), "A user identifier is required.");
            return ValidationProblem(ModelState);
        }

        return Ok(await workflowService.GetOrCreateDraftAsync(request.UserId, cancellationToken));
    }

    [HttpPut("draft/{id:guid}/source")]
    public Task<ActionResult<ApplicationDraftDto>> SetSource(
        Guid id,
        [FromBody] SetApplicationDraftSourceRequest request,
        CancellationToken cancellationToken) =>
        ExecuteAsync(() => workflowService.SetSourceAsync(id, request, cancellationToken));

    [HttpPost("draft/{id:guid}/review")]
    public Task<ActionResult<ApplicationDraftDto>> Review(
        Guid id,
        CancellationToken cancellationToken) =>
        ExecuteAsync(() => workflowService.ReviewAsync(id, cancellationToken));

    [HttpPost("draft/{id:guid}/tailor")]
    public Task<ActionResult<ApplicationDraftDto>> Tailor(
        Guid id,
        CancellationToken cancellationToken) =>
        ExecuteAsync(() => workflowService.TailorAsync(id, cancellationToken));

    [HttpGet("draft/{id:guid}/tailored-cv/pdf")]
    [Produces("application/pdf")]
    public async Task<IActionResult> GetTailoredCvPdf(
        Guid id,
        [FromQuery] bool download = false,
        CancellationToken cancellationToken = default)
    {
        var pdf = await workflowService.GetTailoredPdfAsync(id, cancellationToken);
        if (pdf is null)
        {
            return NotFound();
        }

        return download
            ? File(pdf.Content, "application/pdf", pdf.FileName, enableRangeProcessing: true)
            : File(pdf.Content, "application/pdf", enableRangeProcessing: true);
    }

    [HttpGet("draft/{id:guid}/tailored-cv/comparison")]
    [ProducesResponseType<TailoredCvComparisonDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<TailoredCvComparisonDto>> GetTailoredCvComparison(
        Guid id,
        CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await workflowService.GetTailoredComparisonAsync(id, cancellationToken));
        }
        catch (ApplicationWorkflowException exception)
        {
            return WorkflowProblem(exception);
        }
    }

    [HttpPost("draft/{id:guid}/tailored-cv/approve")]
    public Task<ActionResult<ApplicationDraftDto>> ApproveTailoredCvChanges(
        Guid id,
        [FromBody] ApproveTailoredCvChangesRequest request,
        CancellationToken cancellationToken) =>
        ExecuteAsync(() => workflowService.ApproveTailoredChangesAsync(
            id,
            request,
            cancellationToken));

    [HttpPost("draft/{id:guid}/cover-letter")]
    public Task<ActionResult<ApplicationDraftDto>> GenerateCoverLetter(
        Guid id,
        CancellationToken cancellationToken) =>
        ExecuteAsync(() => workflowService.GenerateCoverLetterAsync(id, cancellationToken));

    [HttpGet("draft/{id:guid}/cover-letter/pdf")]
    [Produces("application/pdf")]
    public async Task<IActionResult> GetCoverLetterPdf(
        Guid id,
        [FromQuery] bool download = true,
        CancellationToken cancellationToken = default)
    {
        var pdf = await workflowService.GetCoverLetterPdfAsync(id, cancellationToken);
        if (pdf is null)
        {
            return NotFound();
        }

        return download
            ? File(pdf.Content, "application/pdf", pdf.FileName, enableRangeProcessing: true)
            : File(pdf.Content, "application/pdf", enableRangeProcessing: true);
    }

    [HttpPost("draft/{id:guid}/interview-questions")]
    public Task<ActionResult<ApplicationDraftDto>> GenerateInterviewQuestions(
        Guid id,
        CancellationToken cancellationToken) =>
        ExecuteAsync(() => workflowService.GenerateInterviewQuestionsAsync(id, cancellationToken));

    [HttpPut("draft/{id:guid}/interview-answers")]
    public Task<ActionResult<ApplicationDraftDto>> SaveInterviewAnswers(
        Guid id,
        [FromBody] SaveInterviewAnswersRequest request,
        CancellationToken cancellationToken) =>
        ExecuteAsync(() => workflowService.SaveInterviewAnswersAsync(
            id,
            request,
            cancellationToken));

    [HttpGet("draft/{id:guid}/interview-questions/pdf")]
    [Produces("application/pdf")]
    public async Task<IActionResult> GetInterviewQuestionsPdf(
        Guid id,
        [FromQuery] bool download = true,
        CancellationToken cancellationToken = default)
    {
        var pdf = await workflowService.GetInterviewQuestionsPdfAsync(id, cancellationToken);
        if (pdf is null)
        {
            return NotFound();
        }

        return download
            ? File(pdf.Content, "application/pdf", pdf.FileName, enableRangeProcessing: true)
            : File(pdf.Content, "application/pdf", enableRangeProcessing: true);
    }

    [HttpPost("draft/{id:guid}/log")]
    [ProducesResponseType<JobApplicationDto>(StatusCodes.Status201Created)]
    public async Task<ActionResult<JobApplicationDto>> Log(
        Guid id,
        [FromBody] LogApplicationDraftRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var job = await workflowService.LogAsync(id, request, cancellationToken);
            return CreatedAtAction(
                nameof(JobsController.GetById),
                "Jobs",
                new { id = job.Id },
                job);
        }
        catch (ApplicationWorkflowException exception)
        {
            return WorkflowProblem(exception);
        }
        catch (CvWorkflowException exception)
        {
            return Problem(
                statusCode: exception.StatusCode,
                title: "Application workflow failed",
                detail: exception.Message);
        }
        catch (MembershipLimitException exception)
        {
            return Problem(
                statusCode: StatusCodes.Status402PaymentRequired,
                title: "AI allowance used",
                detail: exception.Message);
        }
    }

    private async Task<ActionResult<ApplicationDraftDto>> ExecuteAsync(
        Func<Task<ApplicationDraftDto>> operation)
    {
        try
        {
            return Ok(await operation());
        }
        catch (ApplicationWorkflowException exception)
        {
            return WorkflowProblem(exception);
        }
        catch (CvWorkflowException exception)
        {
            return Problem(
                statusCode: exception.StatusCode,
                title: "Application workflow failed",
                detail: exception.Message);
        }
        catch (MembershipLimitException exception)
        {
            return Problem(
                statusCode: StatusCodes.Status402PaymentRequired,
                title: "AI allowance used",
                detail: exception.Message);
        }
    }

    private ObjectResult WorkflowProblem(ApplicationWorkflowException exception) =>
        Problem(
            statusCode: exception.StatusCode,
            title: "Application workflow failed",
            detail: exception.Message);
}
