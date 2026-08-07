using JobTracker.Application.Jobs.Dtos;

namespace JobTracker.Application.Jobs;

public interface IJobApplicationService
{
    Task<IReadOnlyList<JobApplicationDto>> GetAllAsync(
        Guid userId,
        CancellationToken cancellationToken = default);

    Task<JobApplicationDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);

    Task<JobApplicationDto> CreateAsync(
        CreateJobApplicationRequest request,
        CancellationToken cancellationToken = default);

    Task<JobApplicationDto?> UpdateStatusAsync(
        Guid id,
        UpdateJobStatusRequest request,
        CancellationToken cancellationToken = default);

    Task<JobApplicationDto?> UpdateDetailsAsync(
        Guid id,
        UpdateJobDetailsRequest request,
        CancellationToken cancellationToken = default);

    Task<JobApplicationDto?> UpdateDescriptionAsync(
        Guid id,
        UpdateJobDescriptionRequest request,
        CancellationToken cancellationToken = default);

    Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default);
}
