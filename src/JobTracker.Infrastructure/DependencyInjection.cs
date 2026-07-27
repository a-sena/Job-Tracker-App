using JobTracker.Application.Abstractions.Persistence;
using JobTracker.Application.Cvs;
using JobTracker.Infrastructure.Cvs;
using JobTracker.Application.Jobs;
using JobTracker.Infrastructure.Jobs;
using JobTracker.Infrastructure.Persistence;
using JobTracker.Infrastructure.Persistence.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace JobTracker.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("JobTrackerDatabase")
            ?? throw new InvalidOperationException(
                "Connection string 'JobTrackerDatabase' is not configured.");

        services.AddDbContext<JobTrackerDbContext>(options =>
            options.UseNpgsql(
                connectionString,
                npgsqlOptions => npgsqlOptions.EnableRetryOnFailure()));

        services.AddScoped<IJobApplicationRepository, JobApplicationRepository>();
        services.AddScoped<IMasterCvRepository, MasterCvRepository>();
        services.AddScoped<ITailoredCvRepository, TailoredCvRepository>();

        var aiProcessingBaseUrl = configuration["Services:AiProcessing:BaseUrl"]
            ?? throw new InvalidOperationException(
                "Configuration value 'Services:AiProcessing:BaseUrl' is missing.");

        services.AddHttpClient<IJobExtractionService, JobExtractionService>(client =>
        {
            client.BaseAddress = new Uri(aiProcessingBaseUrl, UriKind.Absolute);
            client.Timeout = TimeSpan.FromSeconds(30);
        });

        services.AddHttpClient<ICvTailoringGateway, CvTailoringGateway>(client =>
        {
            client.BaseAddress = new Uri(aiProcessingBaseUrl, UriKind.Absolute);
            client.Timeout = TimeSpan.FromSeconds(120);
        });

        services.AddHttpClient<IMasterCvImportGateway, MasterCvImportGateway>(client =>
        {
            client.BaseAddress = new Uri(aiProcessingBaseUrl, UriKind.Absolute);
            client.Timeout = TimeSpan.FromSeconds(120);
        });

        return services;
    }
}
