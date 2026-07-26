using System.Net.Http.Json;
using JobTracker.Application.Jobs;
using JobTracker.Application.Jobs.Dtos;

namespace JobTracker.Infrastructure.Jobs;

internal sealed class JobExtractionService(HttpClient httpClient)
    : IJobExtractionService
{
    public async Task<ExtractedJobDto> ExtractAsync(
        ExtractJobRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        HttpResponseMessage response;

        try
        {
            response = await httpClient.PostAsJsonAsync(
                "api/extract-job",
                request,
                cancellationToken);
        }
        catch (HttpRequestException exception)
        {
            throw new JobExtractionException(
                "The job extraction service is unavailable.",
                503,
                exception);
        }
        catch (TaskCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw new JobExtractionException(
                "The job extraction service timed out.",
                504,
                exception);
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                throw new JobExtractionException(
                    "The vacancy could not be extracted. You can enter its details manually.",
                    (int)response.StatusCode);
            }

            var extractedJob = await response.Content.ReadFromJsonAsync<ExtractedJobDto>(
                cancellationToken: cancellationToken);

            return extractedJob
                ?? throw new JobExtractionException(
                    "The extraction service returned an empty response.",
                    502);
        }
    }
}
