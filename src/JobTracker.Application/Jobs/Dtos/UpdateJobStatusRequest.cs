using System.ComponentModel.DataAnnotations;
using JobTracker.Domain.Enums;

namespace JobTracker.Application.Jobs.Dtos;

public sealed class UpdateJobStatusRequest
{
    [Required]
    [EnumDataType(typeof(JobApplicationStatus))]
    public JobApplicationStatus Status { get; init; }
}
