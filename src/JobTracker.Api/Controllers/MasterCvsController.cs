using JobTracker.Application.Cvs;
using JobTracker.Application.Cvs.Dtos;
using Microsoft.AspNetCore.Mvc;

namespace JobTracker.Api.Controllers;

[ApiController]
[Route("api/master-cvs")]
[Produces("application/json")]
public sealed class MasterCvsController(ICvService cvService) : ControllerBase
{
    private const long MaxPdfBytes = 8_000_000;

    /// <summary>
    /// Extracts editable structured CV fields from a text-based PDF.
    /// </summary>
    [HttpPost("import-pdf")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(8_500_000)]
    [ProducesResponseType<ImportedMasterCvDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status413PayloadTooLarge)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status415UnsupportedMediaType)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status502BadGateway)]
    public async Task<ActionResult<ImportedMasterCvDto>> ImportPdf(
        IFormFile file,
        CancellationToken cancellationToken)
    {
        if (file.Length is <= 0 or > MaxPdfBytes)
        {
            return Problem(
                statusCode: file.Length <= 0
                    ? StatusCodes.Status400BadRequest
                    : StatusCodes.Status413PayloadTooLarge,
                title: "Invalid CV PDF",
                detail: file.Length <= 0
                    ? "The uploaded PDF is empty."
                    : "The CV PDF must be smaller than 8 MB.");
        }

        var fileName = Path.GetFileName(file.FileName);
        var contentType = string.IsNullOrWhiteSpace(file.ContentType)
            ? "application/octet-stream"
            : file.ContentType;

        await using var stream = new MemoryStream((int)file.Length);
        await file.CopyToAsync(stream, cancellationToken);

        try
        {
            var imported = await cvService.ImportPdfAsync(
                stream.ToArray(),
                fileName,
                contentType,
                cancellationToken);
            return Ok(imported);
        }
        catch (CvWorkflowException exception)
        {
            return Problem(
                statusCode: exception.StatusCode,
                title: "PDF CV import failed",
                detail: exception.Message);
        }
    }

    /// <summary>
    /// Returns the user's current factual source CV.
    /// </summary>
    [HttpGet("{userId:guid}")]
    [ProducesResponseType<MasterCvDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<MasterCvDto>> Get(
        Guid userId,
        CancellationToken cancellationToken)
    {
        var masterCv = await cvService.GetMasterCvAsync(userId, cancellationToken);
        return masterCv is null ? NotFound() : Ok(masterCv);
    }

    /// <summary>
    /// Creates or replaces the user's current factual source CV.
    /// </summary>
    [HttpPut("{userId:guid}")]
    [ProducesResponseType<MasterCvDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<MasterCvDto>> Upsert(
        Guid userId,
        [FromBody] UpsertMasterCvRequest request,
        CancellationToken cancellationToken)
    {
        var masterCv = await cvService.UpsertMasterCvAsync(
            userId,
            request,
            cancellationToken);

        return Ok(masterCv);
    }
}
