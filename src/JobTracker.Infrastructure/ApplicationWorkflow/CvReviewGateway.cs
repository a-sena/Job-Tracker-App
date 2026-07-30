using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using JobTracker.Application.ApplicationWorkflow;
using JobTracker.Application.Cvs.Dtos;

namespace JobTracker.Infrastructure.ApplicationWorkflow;

internal sealed class CvReviewGateway(HttpClient httpClient) : ICvReviewGateway
{
    private static readonly JsonSerializerOptions RequestJsonOptions =
        new(JsonSerializerDefaults.Web)
        {
            PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        };
    private static readonly JsonSerializerOptions ResponseJsonOptions =
        new(JsonSerializerDefaults.Web);

    public async Task<CvReviewResult> ReviewAsync(
        MasterCvContentDto masterCv,
        string jobDescription,
        CancellationToken cancellationToken = default)
    {
        HttpResponseMessage response;
        try
        {
            response = await httpClient.PostAsJsonAsync(
                "api/review-cv",
                new ReviewRequest(masterCv, jobDescription),
                RequestJsonOptions,
                cancellationToken);
        }
        catch (HttpRequestException exception)
        {
            throw new ApplicationWorkflowException(
                "The ATS review service is unavailable.",
                503,
                exception);
        }
        catch (TaskCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw new ApplicationWorkflowException(
                "The ATS review timed out. Please try again.",
                504,
                exception);
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                throw new ApplicationWorkflowException(
                    "The CV could not be reviewed. Verify the CV and job description.",
                    (int)response.StatusCode);
            }

            try
            {
                var result = await response.Content.ReadFromJsonAsync<CvReviewResult>(
                    ResponseJsonOptions,
                    cancellationToken)
                    ?? throw new ApplicationWorkflowException(
                        "The ATS review service returned an empty response.",
                        502);

                if (result.AtsMatchScore is < 0 or > 100 ||
                    result.MatchedKeywords is null ||
                    result.MissingKeywords is null ||
                    string.IsNullOrWhiteSpace(result.Explanation) ||
                    result.MatchedKeywords.Any(string.IsNullOrWhiteSpace) ||
                    result.MissingKeywords.Any(string.IsNullOrWhiteSpace) ||
                    result.MatchedKeywords
                        .Intersect(result.MissingKeywords, StringComparer.OrdinalIgnoreCase)
                        .Any())
                {
                    throw new ApplicationWorkflowException(
                        "The ATS review service returned an invalid response.",
                        502);
                }

                return result;
            }
            catch (JsonException exception)
            {
                throw new ApplicationWorkflowException(
                    "The ATS review service returned an invalid response.",
                    502,
                    exception);
            }
        }
    }

    private sealed record ReviewRequest(
        [property: JsonPropertyName("masterCv")] MasterCvContentDto MasterCv,
        [property: JsonPropertyName("jobDescription")] string JobDescription);
}
