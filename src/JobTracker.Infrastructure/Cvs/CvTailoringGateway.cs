using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using JobTracker.Application.Cvs;
using JobTracker.Application.Cvs.Dtos;

namespace JobTracker.Infrastructure.Cvs;

internal sealed class CvTailoringGateway(HttpClient httpClient) : ICvTailoringGateway
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
    };

    public async Task<GeneratedTailoredCvPackage> GenerateAsync(
        MasterCvContentDto masterCv,
        string jobDescription,
        CvKeywordBaseline? keywordBaseline,
        CancellationToken cancellationToken = default)
    {
        HttpResponseMessage response;

        try
        {
            response = await httpClient.PostAsJsonAsync(
                "api/tailored-cv-package",
                new TailoringRequest(masterCv, jobDescription, keywordBaseline),
                JsonOptions,
                cancellationToken);
        }
        catch (HttpRequestException exception)
        {
            throw new CvWorkflowException(
                "The AI tailoring service is unavailable.",
                503,
                exception);
        }
        catch (TaskCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw new CvWorkflowException(
                "CV tailoring timed out. Please try again.",
                504,
                exception);
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                throw new CvWorkflowException(
                    "The CV could not be tailored. Verify the Master CV and try again.",
                    (int)response.StatusCode);
            }

            TailoredPackageResponse? package;
            try
            {
                package = await response.Content.ReadFromJsonAsync<TailoredPackageResponse>(
                    JsonOptions,
                    cancellationToken);
            }
            catch (JsonException exception)
            {
                throw new CvWorkflowException(
                    "The AI service returned an invalid tailoring response.",
                    502,
                    exception);
            }

            if (package is null)
            {
                throw new CvWorkflowException(
                    "The AI service returned an empty tailoring response.",
                    502);
            }

            if (package.TailoredCv is null ||
                package.MatchedKeywords is null ||
                package.MissingKeywords is null ||
                string.IsNullOrWhiteSpace(package.PdfBase64) ||
                string.IsNullOrWhiteSpace(package.FileName) ||
                package.AtsMatchScore is < 0 or > 100)
            {
                throw new CvWorkflowException(
                    "The AI service returned an incomplete tailoring response.",
                    502);
            }

            byte[] pdfContent;
            try
            {
                pdfContent = Convert.FromBase64String(package.PdfBase64);
            }
            catch (FormatException exception)
            {
                throw new CvWorkflowException(
                    "The AI service returned an invalid PDF.",
                    502,
                    exception);
            }

            if (!IsPdf(pdfContent))
            {
                throw new CvWorkflowException(
                    "The AI service returned an invalid PDF.",
                    502);
            }

            var fileName = Path.GetFileName(package.FileName);
            if (!string.Equals(fileName, package.FileName, StringComparison.Ordinal) ||
                !fileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
            {
                throw new CvWorkflowException(
                    "The AI service returned an unsafe PDF filename.",
                    502);
            }

            return new GeneratedTailoredCvPackage(
                package.TailoredCv,
                package.AtsMatchScore,
                package.MatchedKeywords,
                package.MissingKeywords,
                pdfContent,
                fileName);
        }
    }

    public async Task<GeneratedTailoredCvPackage> FinalizeAsync(
        MasterCvContentDto masterCv,
        MasterCvContentDto proposedCv,
        IReadOnlyList<string> acceptedChangeIds,
        string jobDescription,
        CvKeywordBaseline keywordBaseline,
        CancellationToken cancellationToken = default)
    {
        HttpResponseMessage response;
        try
        {
            response = await httpClient.PostAsJsonAsync(
                "api/finalize-tailored-cv",
                new FinalizeRequest(
                    masterCv,
                    proposedCv,
                    acceptedChangeIds,
                    jobDescription,
                    keywordBaseline),
                JsonOptions,
                cancellationToken);
        }
        catch (HttpRequestException exception)
        {
            throw new CvWorkflowException(
                "The CV approval service is unavailable.",
                503,
                exception);
        }
        catch (TaskCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw new CvWorkflowException(
                "Approving CV changes timed out. Please try again.",
                504,
                exception);
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                throw new CvWorkflowException(
                    "The selected CV changes could not be applied.",
                    (int)response.StatusCode);
            }

            TailoredPackageResponse? package;
            try
            {
                package = await response.Content.ReadFromJsonAsync<TailoredPackageResponse>(
                    JsonOptions,
                    cancellationToken);
            }
            catch (JsonException exception)
            {
                throw new CvWorkflowException(
                    "The CV approval service returned an invalid response.",
                    502,
                    exception);
            }

            if (package?.TailoredCv is null ||
                package.MatchedKeywords is null ||
                package.MissingKeywords is null ||
                package.AtsMatchScore is < 0 or > 100 ||
                string.IsNullOrWhiteSpace(package.PdfBase64) ||
                string.IsNullOrWhiteSpace(package.FileName))
            {
                throw new CvWorkflowException(
                    "The CV approval service returned an incomplete response.",
                    502);
            }

            byte[] pdfContent;
            try
            {
                pdfContent = Convert.FromBase64String(package.PdfBase64);
            }
            catch (FormatException exception)
            {
                throw new CvWorkflowException("The approved PDF is invalid.", 502, exception);
            }

            var fileName = Path.GetFileName(package.FileName);
            if (!IsPdf(pdfContent) ||
                !string.Equals(fileName, package.FileName, StringComparison.Ordinal) ||
                !fileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
            {
                throw new CvWorkflowException("The approved PDF is invalid.", 502);
            }

            return new GeneratedTailoredCvPackage(
                package.TailoredCv,
                package.AtsMatchScore,
                package.MatchedKeywords,
                package.MissingKeywords,
                pdfContent,
                fileName);
        }
    }

    private sealed record TailoringRequest(
        [property: JsonPropertyName("MasterCV")] MasterCvContentDto MasterCv,
        [property: JsonPropertyName("JobDescription")] string JobDescription,
        [property: JsonPropertyName("keywordBaseline")] CvKeywordBaseline? KeywordBaseline);

    private sealed record FinalizeRequest(
        [property: JsonPropertyName("masterCv")] MasterCvContentDto MasterCv,
        [property: JsonPropertyName("proposedCv")] MasterCvContentDto ProposedCv,
        [property: JsonPropertyName("acceptedChangeIds")] IReadOnlyList<string> AcceptedChangeIds,
        [property: JsonPropertyName("jobDescription")] string JobDescription,
        [property: JsonPropertyName("keywordBaseline")] CvKeywordBaseline KeywordBaseline);

    private sealed record TailoredPackageResponse(
        MasterCvContentDto TailoredCv,
        decimal AtsMatchScore,
        IReadOnlyList<string> MatchedKeywords,
        IReadOnlyList<string> MissingKeywords,
        string PdfBase64,
        string FileName);

    private static bool IsPdf(byte[] content) =>
        content is
        [
            (byte)'%',
            (byte)'P',
            (byte)'D',
            (byte)'F',
            (byte)'-',
            ..
        ] &&
        content.Length <= 10_000_000;
}
