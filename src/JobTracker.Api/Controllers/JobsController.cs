using JobTracker.Application.Cvs;
using JobTracker.Application.Cvs.Dtos;
using JobTracker.Application.Jobs;
using JobTracker.Application.Jobs.Dtos;
using Microsoft.AspNetCore.Mvc;

namespace JobTracker.Api.Controllers;

[ApiController]
[Route("api/jobs")]
[Produces("application/json")]
public sealed class JobsController(
    IJobApplicationService jobApplicationService,
    IJobExtractionService jobExtractionService,
    ICvService cvService) : ControllerBase
{
    /// <summary>
    /// Extracts vacancy details from a public job-posting URL for user review.
    /// </summary>
    [HttpPost("extract")]
    [ProducesResponseType<ExtractedJobDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status502BadGateway)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status504GatewayTimeout)]
    public async Task<ActionResult<ExtractedJobDto>> Extract(
        [FromBody] ExtractJobRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var extractedJob = await jobExtractionService.ExtractAsync(
                request,
                cancellationToken);
            return Ok(extractedJob);
        }
        catch (JobExtractionException exception)
        {
            return Problem(
                statusCode: exception.UpstreamStatusCode,
                title: "Job extraction failed",
                detail: exception.Message);
        }
    }

    /// <summary>
    /// Returns all tracked job applications, most recently updated first.
    /// </summary>
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<JobApplicationDto>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<JobApplicationDto>>> GetAll(
        CancellationToken cancellationToken)
    {
        var jobs = await jobApplicationService.GetAllAsync(cancellationToken);
        return Ok(jobs);
    }

    /// <summary>
    /// Returns one tracked job application.
    /// </summary>
    [HttpGet("{id:guid}")]
    [ProducesResponseType<JobApplicationDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<JobApplicationDto>> GetById(
        Guid id,
        CancellationToken cancellationToken)
    {
        var job = await jobApplicationService.GetByIdAsync(id, cancellationToken);
        return job is null ? NotFound() : Ok(job);
    }

    /// <summary>
    /// Adds an extracted vacancy to the application tracker.
    /// </summary>
    [HttpPost]
    [ProducesResponseType<JobApplicationDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<JobApplicationDto>> Create(
        [FromBody] CreateJobApplicationRequest request,
        CancellationToken cancellationToken)
    {
        var createdJob = await jobApplicationService.CreateAsync(request, cancellationToken);

        return CreatedAtAction(
            nameof(GetById),
            new { id = createdJob.Id },
            createdJob);
    }

    /// <summary>
    /// Generates and persists a truth-grounded tailored CV for one application.
    /// </summary>
    [HttpPost("{id:guid}/tailored-cv")]
    [ProducesResponseType<TailoredCvDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status502BadGateway)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status504GatewayTimeout)]
    public async Task<ActionResult<TailoredCvDto>> GenerateTailoredCv(
        Guid id,
        CancellationToken cancellationToken)
    {
        try
        {
            var tailoredCv = await cvService.GenerateTailoredCvAsync(
                id,
                cancellationToken);
            return Ok(tailoredCv);
        }
        catch (CvWorkflowException exception)
        {
            return Problem(
                statusCode: exception.StatusCode,
                title: "CV tailoring failed",
                detail: exception.Message);
        }
    }

    /// <summary>
    /// Returns metadata for the latest tailored CV generated for an application.
    /// </summary>
    [HttpGet("{id:guid}/tailored-cv")]
    [ProducesResponseType<TailoredCvDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<TailoredCvDto>> GetTailoredCv(
        Guid id,
        CancellationToken cancellationToken)
    {
        var tailoredCv = await cvService.GetLatestTailoredCvAsync(
            id,
            cancellationToken);
        return tailoredCv is null ? NotFound() : Ok(tailoredCv);
    }

    /// <summary>
    /// Downloads the latest persisted tailored CV PDF.
    /// </summary>
    [HttpGet("{id:guid}/tailored-cv/pdf")]
    [Produces("application/pdf")]
    [ProducesResponseType<FileContentResult>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DownloadTailoredCv(
        Guid id,
        CancellationToken cancellationToken)
    {
        var pdf = await cvService.GetLatestPdfAsync(id, cancellationToken);

        return pdf is null
            ? NotFound()
            : File(
                pdf.Content,
                "application/pdf",
                pdf.FileName,
                enableRangeProcessing: true);
    }

    /// <summary>
    /// Moves a job application to a different Kanban status.
    /// </summary>
    [HttpPut("{id:guid}/status")]
    [ProducesResponseType<JobApplicationDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<JobApplicationDto>> UpdateStatus(
        Guid id,
        [FromBody] UpdateJobStatusRequest request,
        CancellationToken cancellationToken)
    {
        var updatedJob = await jobApplicationService.UpdateStatusAsync(
            id,
            request,
            cancellationToken);

        return updatedJob is null ? NotFound() : Ok(updatedJob);
    }

    /// <summary>
    /// Permanently removes a tracked job application and its tailored CVs.
    /// </summary>
    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(
        Guid id,
        CancellationToken cancellationToken)
    {
        var deleted = await jobApplicationService.DeleteAsync(id, cancellationToken);
        return deleted ? NoContent() : NotFound();
    }
}
