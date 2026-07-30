using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using JobTracker.Application.ApplicationWorkflow;
using JobTracker.Application.Cvs.Dtos;

namespace JobTracker.Infrastructure.ApplicationWorkflow;

internal sealed class InterviewQuestionsGateway(HttpClient httpClient)
    : IInterviewQuestionsGateway
{
    private static readonly JsonSerializerOptions RequestJsonOptions =
        new(JsonSerializerDefaults.Web)
        {
            PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        };
    private static readonly JsonSerializerOptions ResponseJsonOptions =
        new(JsonSerializerDefaults.Web);

    public async Task<InterviewQuestionsPackage> GenerateAsync(
        string jobTitle,
        string company,
        string jobDescription,
        MasterCvContentDto masterCv,
        CancellationToken cancellationToken = default)
    {
        HttpResponseMessage response;
        try
        {
            response = await httpClient.PostAsJsonAsync(
                "api/interview-questions-package",
                new InterviewRequest(jobTitle, company, jobDescription, masterCv),
                RequestJsonOptions,
                cancellationToken);
        }
        catch (HttpRequestException exception)
        {
            throw new ApplicationWorkflowException(
                "The interview-question service is unavailable.",
                503,
                exception);
        }
        catch (TaskCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw new ApplicationWorkflowException(
                "Interview-question generation timed out. Please try again.",
                504,
                exception);
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                throw new ApplicationWorkflowException(
                    "Interview questions could not be generated.",
                    (int)response.StatusCode);
            }

            InterviewResponse package;
            try
            {
                package = await response.Content.ReadFromJsonAsync<InterviewResponse>(
                    ResponseJsonOptions,
                    cancellationToken)
                    ?? throw new ApplicationWorkflowException(
                        "The interview-question service returned an empty response.",
                        502);
            }
            catch (JsonException exception)
            {
                throw new ApplicationWorkflowException(
                    "The interview-question service returned an invalid response.",
                    502,
                    exception);
            }

            if (package.Questions is null ||
                package.Questions.Count is < 8 or > 10 ||
                package.Questions.Any(string.IsNullOrWhiteSpace) ||
                package.Questions.Distinct(StringComparer.OrdinalIgnoreCase).Count() !=
                    package.Questions.Count ||
                string.IsNullOrWhiteSpace(package.PdfBase64) ||
                string.IsNullOrWhiteSpace(package.FileName))
            {
                throw new ApplicationWorkflowException(
                    "The interview-question service returned an invalid response.",
                    502);
            }

            byte[] pdfContent;
            try
            {
                pdfContent = Convert.FromBase64String(package.PdfBase64);
            }
            catch (FormatException exception)
            {
                throw new ApplicationWorkflowException(
                    "The interview-question service returned an invalid PDF.",
                    502,
                    exception);
            }

            if (!IsPdf(pdfContent))
            {
                throw new ApplicationWorkflowException(
                    "The interview-question service returned an invalid PDF.",
                    502);
            }

            var fileName = Path.GetFileName(package.FileName);
            if (!string.Equals(fileName, package.FileName, StringComparison.Ordinal) ||
                !fileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
            {
                throw new ApplicationWorkflowException(
                    "The interview-question service returned an unsafe PDF filename.",
                    502);
            }

            return new InterviewQuestionsPackage(
                package.Questions,
                pdfContent,
                fileName);
        }
    }

    private sealed record InterviewRequest(
        [property: JsonPropertyName("jobTitle")] string JobTitle,
        [property: JsonPropertyName("company")] string Company,
        [property: JsonPropertyName("jobDescription")] string JobDescription,
        [property: JsonPropertyName("masterCv")] MasterCvContentDto MasterCv);

    private sealed record InterviewResponse(
        IReadOnlyList<string> Questions,
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
        content.Length <= 5_000_000;
}
