using JobTracker.Application.Abstractions.Persistence;
using JobTracker.Application.Cvs.Dtos;
using JobTracker.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace JobTracker.Infrastructure.Persistence.Repositories;

internal sealed class TailoredCvRepository(JobTrackerDbContext dbContext)
    : ITailoredCvRepository
{
    public Task<TailoredCv?> GetLatestByJobIdAsync(
        Guid jobApplicationId,
        CancellationToken cancellationToken = default) =>
        dbContext.TailoredCvs
            .AsNoTracking()
            .Where(tailoredCv => tailoredCv.JobApplicationId == jobApplicationId)
            .OrderByDescending(tailoredCv => tailoredCv.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

    public async Task<IReadOnlyDictionary<Guid, TailoredCvSummaryDto>>
        GetLatestSummariesAsync(
            IReadOnlyCollection<Guid> jobApplicationIds,
            CancellationToken cancellationToken = default)
    {
        if (jobApplicationIds.Count == 0)
        {
            return new Dictionary<Guid, TailoredCvSummaryDto>();
        }

        var summaries = await dbContext.TailoredCvs
            .AsNoTracking()
            .Where(tailoredCv => jobApplicationIds.Contains(tailoredCv.JobApplicationId))
            .Select(tailoredCv => new TailoredCvSummaryDto(
                tailoredCv.Id,
                tailoredCv.JobApplicationId,
                tailoredCv.AtsMatchScore,
                tailoredCv.MissingKeywords,
                tailoredCv.CreatedAt))
            .ToListAsync(cancellationToken);

        return summaries
            .GroupBy(summary => summary.JobApplicationId)
            .ToDictionary(
                group => group.Key,
                group => group.MaxBy(summary => summary.CreatedAt)!);
    }

    public async Task AddAsync(
        TailoredCv tailoredCv,
        CancellationToken cancellationToken = default) =>
        await dbContext.TailoredCvs.AddAsync(tailoredCv, cancellationToken);

    public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default) =>
        dbContext.SaveChangesAsync(cancellationToken);
}
