using JobTracker.Application.Cvs;
using JobTracker.Application.ApplicationWorkflow;
using JobTracker.Application.Jobs;
using Microsoft.Extensions.DependencyInjection;

namespace JobTracker.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<IJobApplicationService, JobApplicationService>();
        services.AddScoped<ICvService, CvService>();
        services.AddScoped<ISavedCvService, SavedCvService>();
        services.AddScoped<IApplicationWorkflowService, ApplicationWorkflowService>();
        return services;
    }
}
