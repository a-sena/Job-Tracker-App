using System.Net.Http.Json;
using System.Text.Json;
using JobTracker.Application.ApplicationWorkflow;
using JobTracker.Application.ApplicationWorkflow.Dtos;
using JobTracker.Application.Cvs.Dtos;

namespace JobTracker.Infrastructure.ApplicationWorkflow;

internal sealed class CoverLetterGateway(HttpClient httpClient) : ICoverLetterGateway
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<CoverLetterPackage> GenerateAsync(
        string jobTitle,
        string company,
        string jobDescription,
        MasterCvContentDto cv,
        CancellationToken cancellationToken = default)
    {
        HttpResponseMessage response;
        try
        {
            response = await httpClient.PostAsJsonAsync(
                "api/cover-letter-package",
                new CoverLetterRequest(jobTitle, company, jobDescription, cv),
                JsonOptions,
                cancellationToken);
        }
        catch (HttpRequestException exception)
        {
            throw new ApplicationWorkflowException(
                "The cover-letter service is unavailable.",
                503,
                exception);
        }
        catch (TaskCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw new ApplicationWorkflowException(
                "Cover-letter generation timed out. Please try again.",
                504,
                exception);
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                throw new ApplicationWorkflowException(
                    "The cover letter could not be generated. Please try again.",
                    (int)response.StatusCode);
            }

            CoverLetterResponse? result;
            try
            {
                result = await response.Content.ReadFromJsonAsync<CoverLetterResponse>(
                    JsonOptions,
                    cancellationToken);
            }
            catch (JsonException exception)
            {
                throw new ApplicationWorkflowException(
                    "The cover-letter service returned an invalid response.",
                    502,
                    exception);
            }

            if (result?.Letter is null ||
                string.IsNullOrWhiteSpace(result.Letter.Language) ||
                string.IsNullOrWhiteSpace(result.Letter.Subject) ||
                result.Letter.Paragraphs is null ||
                result.Letter.Paragraphs.Count is < 3 or > 6 ||
                result.Letter.Paragraphs.Any(string.IsNullOrWhiteSpace) ||
                result.Letter.Evidence is null ||
                result.Letter.Evidence.Count is < 1 or > 12 ||
                result.Letter.Evidence.Any(item =>
                    string.IsNullOrWhiteSpace(item.Claim) ||
                    string.IsNullOrWhiteSpace(item.EvidenceText)) ||
                string.IsNullOrWhiteSpace(result.PdfBase64) ||
                string.IsNullOrWhiteSpace(result.FileName))
            {
                throw new ApplicationWorkflowException(
                    "The cover-letter service returned an incomplete response.",
                    502);
            }

            byte[] pdf;
            try
            {
                pdf = Convert.FromBase64String(result.PdfBase64);
            }
            catch (FormatException exception)
            {
                throw new ApplicationWorkflowException(
                    "The cover-letter service returned an invalid PDF.",
                    502,
                    exception);
            }

            var fileName = Path.GetFileName(result.FileName);
            if (pdf.Length < 5 ||
                pdf[0] != '%' || pdf[1] != 'P' || pdf[2] != 'D' || pdf[3] != 'F' || pdf[4] != '-' ||
                pdf.Length > 10_000_000 ||
                !string.Equals(fileName, result.FileName, StringComparison.Ordinal) ||
                !fileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
            {
                throw new ApplicationWorkflowException(
                    "The cover-letter service returned an invalid PDF.",
                    502);
            }

            return new CoverLetterPackage(result.Letter, pdf, fileName);
        }
    }

    private sealed record CoverLetterRequest(
        string JobTitle,
        string Company,
        string JobDescription,
        MasterCvContentDto Cv);

    private sealed record CoverLetterResponse(
        CoverLetterDto Letter,
        string PdfBase64,
        string FileName);
}
