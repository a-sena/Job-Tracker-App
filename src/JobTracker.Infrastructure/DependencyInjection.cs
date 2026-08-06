using JobTracker.Application.Abstractions.Persistence;
using JobTracker.Application.ApplicationWorkflow;
using JobTracker.Infrastructure.ApplicationWorkflow;
using JobTracker.Application.Cvs;
using JobTracker.Infrastructure.Cvs;
using JobTracker.Application.Jobs;
using JobTracker.Infrastructure.Jobs;
using JobTracker.Infrastructure.Persistence;
using JobTracker.Infrastructure.Persistence.Repositories;
using JobTracker.Infrastructure.Identity;
using JobTracker.Application.Authentication;
using JobTracker.Application.Membership;
using JobTracker.Infrastructure.Billing;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace JobTracker.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("JobTrackerDatabase");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException(
                "Connection string 'JobTrackerDatabase' is not configured.");
        }

        var dataSourceBuilder = new NpgsqlDataSourceBuilder(connectionString);
        dataSourceBuilder.EnableDynamicJson([typeof(string[])]);
        var dataSource = dataSourceBuilder.Build();
        services.AddSingleton(dataSource);

        services.AddDbContext<JobTrackerDbContext>(options =>
            options.UseNpgsql(
                dataSource,
                npgsqlOptions => npgsqlOptions.EnableRetryOnFailure()));

        services
            .AddAuthentication(IdentityConstants.ApplicationScheme)
            .AddIdentityCookies();
        services
            .AddIdentityCore<AppUser>(options =>
            {
                options.User.RequireUniqueEmail = true;
                options.Password.RequiredLength = 10;
                options.Password.RequireUppercase = true;
                options.Password.RequireLowercase = true;
                options.Password.RequireDigit = true;
                options.Password.RequireNonAlphanumeric = false;
                options.Lockout.AllowedForNewUsers = true;
                options.Lockout.MaxFailedAccessAttempts = 5;
                options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
                options.SignIn.RequireConfirmedEmail = false;
            })
            .AddRoles<IdentityRole<Guid>>()
            .AddSignInManager()
            .AddEntityFrameworkStores<JobTrackerDbContext>()
            .AddDefaultTokenProviders();
        services.ConfigureApplicationCookie(options =>
        {
            options.Cookie.Name = "Rolevya.Auth";
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Strict;
            options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
            options.ExpireTimeSpan = TimeSpan.FromDays(7);
            options.SlidingExpiration = true;
            options.Events.OnRedirectToLogin = context =>
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return Task.CompletedTask;
            };
            options.Events.OnRedirectToAccessDenied = context =>
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                return Task.CompletedTask;
            };
        });

        services.AddScoped<IJobApplicationRepository, JobApplicationRepository>();
        services.AddScoped<IMasterCvRepository, MasterCvRepository>();
        services.AddScoped<ITailoredCvRepository, TailoredCvRepository>();
        services.AddScoped<IApplicationDraftRepository, ApplicationDraftRepository>();
        services.AddScoped<IApplicationCategoryRepository, ApplicationCategoryRepository>();
        services.AddScoped<ILegacyWorkspaceClaimService, LegacyWorkspaceClaimService>();
        services.Configure<StripeBillingOptions>(
            configuration.GetSection(StripeBillingOptions.SectionName));
        services.AddScoped<StripeBillingService>();
        services.AddScoped<IBillingService>(provider =>
            provider.GetRequiredService<StripeBillingService>());
        services.AddScoped<IMembershipService, MembershipService>();

        var aiProcessingBaseUrl = configuration["Services:AiProcessing:BaseUrl"];
        if (string.IsNullOrWhiteSpace(aiProcessingBaseUrl))
        {
            throw new InvalidOperationException(
                "Configuration value 'Services:AiProcessing:BaseUrl' is missing.");
        }

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

        services.AddHttpClient<ICvReviewGateway, CvReviewGateway>(client =>
        {
            client.BaseAddress = new Uri(aiProcessingBaseUrl, UriKind.Absolute);
            client.Timeout = TimeSpan.FromSeconds(120);
        });

        services.AddHttpClient<IInterviewQuestionsGateway, InterviewQuestionsGateway>(client =>
        {
            client.BaseAddress = new Uri(aiProcessingBaseUrl, UriKind.Absolute);
            client.Timeout = TimeSpan.FromSeconds(120);
        });

        services.AddHttpClient<ICoverLetterGateway, CoverLetterGateway>(client =>
        {
            client.BaseAddress = new Uri(aiProcessingBaseUrl, UriKind.Absolute);
            client.Timeout = TimeSpan.FromSeconds(120);
        });

        return services;
    }
}
