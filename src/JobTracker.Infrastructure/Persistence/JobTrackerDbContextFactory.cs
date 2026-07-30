using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Npgsql;

namespace JobTracker.Infrastructure.Persistence;

/// <summary>
/// Creates the EF Core context for migration commands without bootstrapping the
/// ASP.NET Core host or its platform-specific logging providers.
/// </summary>
public sealed class JobTrackerDbContextFactory
    : IDesignTimeDbContextFactory<JobTrackerDbContext>
{
    public JobTrackerDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable(
            "ConnectionStrings__JobTrackerDatabase");

        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException(
                "Set the 'ConnectionStrings__JobTrackerDatabase' environment "
                + "variable before running EF Core migration commands.");
        }

        var dataSourceBuilder = new NpgsqlDataSourceBuilder(connectionString);
        dataSourceBuilder.EnableDynamicJson([typeof(string[])]);

        var options = new DbContextOptionsBuilder<JobTrackerDbContext>()
            .UseNpgsql(dataSourceBuilder.Build())
            .Options;

        return new JobTrackerDbContext(options);
    }
}
