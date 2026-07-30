using JobTracker.Application.Abstractions.Persistence;
using JobTracker.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace JobTracker.Infrastructure.Persistence.Repositories;

internal sealed class JobApplicationRepository(JobTrackerDbContext dbContext)
    : IJobApplicationRepository
{
    public async Task<IReadOnlyList<JobApplication>> GetAllByUserIdAsync(
        Guid userId,
        CancellationToken cancellationToken = default) =>
        await dbContext.JobApplications
            .AsNoTracking()
            .Include(jobApplication => jobApplication.Category)
            .Where(jobApplication => jobApplication.UserId == userId)
            .OrderByDescending(jobApplication => jobApplication.UpdatedAt)
            .ToListAsync(cancellationToken);

    public async Task<JobApplication?> GetByIdAsync(
        Guid id,
        bool asTracking = false,
        CancellationToken cancellationToken = default)
    {
        IQueryable<JobApplication> query = dbContext.JobApplications;
        query = query.Include(jobApplication => jobApplication.Category);

        if (!asTracking)
        {
            query = query.AsNoTracking();
        }

        return await query.SingleOrDefaultAsync(
            jobApplication => jobApplication.Id == id,
            cancellationToken);
    }

    public async Task AddAsync(
        JobApplication jobApplication,
        CancellationToken cancellationToken = default) =>
        await dbContext.JobApplications.AddAsync(jobApplication, cancellationToken);

    public void Remove(JobApplication jobApplication) =>
        dbContext.JobApplications.Remove(jobApplication);

    public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default) =>
        dbContext.SaveChangesAsync(cancellationToken);
}
