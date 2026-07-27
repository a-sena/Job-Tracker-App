using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using JobTracker.Application.Cvs;
using JobTracker.Application.Cvs.Dtos;

namespace JobTracker.Infrastructure.Cvs;

internal sealed class MasterCvImportGateway(HttpClient httpClient)
    : IMasterCvImportGateway
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
    };

    public async Task<ImportedMasterCvDto> ImportPdfAsync(
        byte[] pdfContent,
        string fileName,
        string contentType,
        CancellationToken cancellationToken = default)
    {
        using var multipartContent = new MultipartFormDataContent();
        using var fileContent = new ByteArrayContent(pdfContent);
        fileContent.Headers.ContentType = MediaTypeHeaderValue.Parse(contentType);
        multipartContent.Add(fileContent, "file", fileName);

        HttpResponseMessage response;
        try
        {
            response = await httpClient.PostAsync(
                "api/extract-master-cv",
                multipartContent,
                cancellationToken);
        }
        catch (HttpRequestException exception)
        {
            throw new CvWorkflowException(
                "The PDF CV extraction service is unavailable.",
                503,
                exception);
        }
        catch (TaskCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw new CvWorkflowException(
                "PDF CV extraction timed out. Please try again.",
                504,
                exception);
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                throw new CvWorkflowException(
                    await ReadSafeErrorAsync(response, cancellationToken),
                    (int)response.StatusCode);
            }

            ExtractedMasterCvResponse? extracted;
            try
            {
                extracted =
                    await response.Content.ReadFromJsonAsync<ExtractedMasterCvResponse>(
                        JsonOptions,
                        cancellationToken);
            }
            catch (JsonException exception)
            {
                throw new CvWorkflowException(
                    "The PDF extraction service returned invalid CV data.",
                    502,
                    exception);
            }

            return extracted is null
                ? throw new CvWorkflowException(
                    "The PDF extraction service returned an empty response.",
                    502)
                : new ImportedMasterCvDto(
                    extracted.Content,
                    extracted.Warnings,
                    fileName);
        }
    }

    private static async Task<string> ReadSafeErrorAsync(
        HttpResponseMessage response,
        CancellationToken cancellationToken)
    {
        try
        {
            var problem = await response.Content.ReadFromJsonAsync<ProblemResponse>(
                JsonOptions,
                cancellationToken);
            return problem?.Detail
                ?? "The PDF could not be imported. Verify the file and try again.";
        }
        catch (JsonException)
        {
            return "The PDF could not be imported. Verify the file and try again.";
        }
    }

    private sealed record ExtractedMasterCvResponse(
        MasterCvContentDto Content,
        IReadOnlyList<string> Warnings);

    private sealed record ProblemResponse(string? Detail);
}
