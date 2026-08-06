using JobTracker.Application.Cvs;
using JobTracker.Application.Cvs.Dtos;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JobTracker.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/cvs")]
[Produces("application/json")]
public sealed class CvsController(ISavedCvService savedCvService) : ControllerBase
{
    private const long MaxPdfBytes = 8_000_000;

    [HttpGet]
    [ProducesResponseType<IReadOnlyList<SavedCvDto>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<SavedCvDto>>> GetAll(
        [FromQuery] Guid userId,
        CancellationToken cancellationToken)
    {
        if (userId == Guid.Empty)
        {
            ModelState.AddModelError(nameof(userId), "A user identifier is required.");
            return ValidationProblem(ModelState);
        }

        return Ok(await savedCvService.GetAllAsync(userId, cancellationToken));
    }

    [HttpPost("import-pdf")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(8_500_000)]
    [ProducesResponseType<SavedCvDto>(StatusCodes.Status201Created)]
    public async Task<ActionResult<SavedCvDto>> ImportPdf(
        [FromForm] Guid userId,
        [FromForm] string? name,
        [FromForm] IFormFile file,
        CancellationToken cancellationToken)
    {
        if (userId == Guid.Empty)
        {
            ModelState.AddModelError(nameof(userId), "A user identifier is required.");
        }

        if (file.Length is <= 0 or > MaxPdfBytes)
        {
            ModelState.AddModelError(
                nameof(file),
                file.Length <= 0
                    ? "The uploaded PDF is empty."
                    : "The CV PDF must be smaller than 8 MB.");
        }

        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var fileName = Path.GetFileName(file.FileName);
        var contentType = string.IsNullOrWhiteSpace(file.ContentType)
            ? "application/pdf"
            : file.ContentType;
        await using var stream = new MemoryStream((int)file.Length);
        await file.CopyToAsync(stream, cancellationToken);

        try
        {
            var saved = await savedCvService.ImportPdfAsync(
                userId,
                name,
                stream.ToArray(),
                fileName,
                contentType,
                cancellationToken);
            return Created($"/api/cvs/{saved.Id}", saved);
        }
        catch (CvWorkflowException exception)
        {
            return Problem(
                statusCode: exception.StatusCode,
                title: "CV import failed",
                detail: exception.Message);
        }
    }

    [HttpPut("{id:guid}")]
    [ProducesResponseType<SavedCvDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<SavedCvDto>> Rename(
        Guid id,
        [FromBody] RenameSavedCvRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var renamed = await savedCvService.RenameAsync(id, request.Name, cancellationToken);
            return renamed is null ? NotFound() : Ok(renamed);
        }
        catch (ArgumentException exception)
        {
            return Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Invalid CV name",
                detail: exception.Message);
        }
    }

    [HttpPut("{id:guid}/default")]
    [ProducesResponseType<SavedCvDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<SavedCvDto>> SetDefault(
        Guid id,
        CancellationToken cancellationToken)
    {
        var updated = await savedCvService.SetDefaultAsync(id, cancellationToken);
        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Delete(
        Guid id,
        CancellationToken cancellationToken)
    {
        try
        {
            return await savedCvService.DeleteAsync(id, cancellationToken)
                ? NoContent()
                : NotFound();
        }
        catch (CvWorkflowException exception)
        {
            return Problem(
                statusCode: exception.StatusCode,
                title: "CV cannot be deleted",
                detail: exception.Message);
        }
    }
}
