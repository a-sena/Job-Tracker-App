using JobTracker.Application.Jobs.Dtos;
using JobTracker.Application.Cvs.Dtos;
using JobTracker.Domain.Entities;

namespace JobTracker.Application.Jobs.Mappings;

internal static class JobApplicationMappings
{
    public static JobApplicationDto ToDto(
        this JobApplication jobApplication,
        TailoredCvSummaryDto? tailoredCv = null) =>
        new(
            jobApplication.Id,
            jobApplication.UserId,
            jobApplication.JobUrl,
            jobApplication.Title,
            jobApplication.Company,
            jobApplication.Description,
            jobApplication.Location,
            jobApplication.Status,
            jobApplication.CreatedAt,
            jobApplication.UpdatedAt,
            tailoredCv?.AtsMatchScore,
            tailoredCv?.Id,
            tailoredCv?.MissingKeywords ?? []);
}
