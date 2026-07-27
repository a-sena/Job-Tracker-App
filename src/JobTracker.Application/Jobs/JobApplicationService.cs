using JobTracker.Application.Abstractions.Persistence;
using JobTracker.Application.Jobs.Dtos;
using JobTracker.Application.Jobs.Mappings;
using JobTracker.Domain.Entities;

namespace JobTracker.Application.Jobs;

internal sealed class JobApplicationService(
    IJobApplicationRepository repository,
    ITailoredCvRepository tailoredCvRepository) : IJobApplicationService
{
    public async Task<IReadOnlyList<JobApplicationDto>> GetAllAsync(
        CancellationToken cancellationToken = default)
    {
        var jobApplications = await repository.GetAllAsync(cancellationToken);
        var summaries = await tailoredCvRepository.GetLatestSummariesAsync(
            jobApplications.Select(jobApplication => jobApplication.Id).ToArray(),
            cancellationToken);

        return jobApplications
            .Select(jobApplication =>
                jobApplication.ToDto(summaries.GetValueOrDefault(jobApplication.Id)))
            .ToArray();
    }

    public async Task<JobApplicationDto?> GetByIdAsync(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        var jobApplication = await repository.GetByIdAsync(
            id,
            cancellationToken: cancellationToken);

        if (jobApplication is null)
        {
            return null;
        }

        var summaries = await tailoredCvRepository.GetLatestSummariesAsync(
            [jobApplication.Id],
            cancellationToken);

        return jobApplication.ToDto(summaries.GetValueOrDefault(jobApplication.Id));
    }

    public async Task<JobApplicationDto> CreateAsync(
        CreateJobApplicationRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        var jobApplication = JobApplication.Create(
            request.UserId,
            request.JobUrl,
            request.Title,
            request.Company,
            request.Description,
            request.Location);

        await repository.AddAsync(jobApplication, cancellationToken);
        await repository.SaveChangesAsync(cancellationToken);

        return jobApplication.ToDto();
    }

    public async Task<JobApplicationDto?> UpdateStatusAsync(
        Guid id,
        UpdateJobStatusRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        var jobApplication = await repository.GetByIdAsync(
            id,
            asTracking: true,
            cancellationToken);

        if (jobApplication is null)
        {
            return null;
        }

        jobApplication.ChangeStatus(request.Status);
        await repository.SaveChangesAsync(cancellationToken);

        var summaries = await tailoredCvRepository.GetLatestSummariesAsync(
            [jobApplication.Id],
            cancellationToken);

        return jobApplication.ToDto(summaries.GetValueOrDefault(jobApplication.Id));
    }

    public async Task<bool> DeleteAsync(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        var jobApplication = await repository.GetByIdAsync(
            id,
            asTracking: true,
            cancellationToken);

        if (jobApplication is null)
        {
            return false;
        }

        repository.Remove(jobApplication);
        await repository.SaveChangesAsync(cancellationToken);

        return true;
    }
}
