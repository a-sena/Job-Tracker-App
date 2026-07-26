using JobTracker.Application.Jobs;
using Microsoft.Extensions.DependencyInjection;

namespace JobTracker.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<IJobApplicationService, JobApplicationService>();
        return services;
    }
}
