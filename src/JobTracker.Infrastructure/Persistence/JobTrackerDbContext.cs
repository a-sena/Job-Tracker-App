using JobTracker.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace JobTracker.Infrastructure.Persistence;

public sealed class JobTrackerDbContext(DbContextOptions<JobTrackerDbContext> options)
    : DbContext(options)
{
    public DbSet<JobApplication> JobApplications => Set<JobApplication>();

    public DbSet<MasterCv> MasterCvs => Set<MasterCv>();

    public DbSet<TailoredCv> TailoredCvs => Set<TailoredCv>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(JobTrackerDbContext).Assembly);
    }
}
