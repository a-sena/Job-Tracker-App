using System.Text.Json.Serialization;
using JobTracker.Application;
using JobTracker.Application.Authentication;
using JobTracker.Api.Authentication;
using JobTracker.Infrastructure;
using JobTracker.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

if (int.TryParse(
        Environment.GetEnvironmentVariable("PORT"),
        out var railwayPort) &&
    railwayPort is > 0 and <= 65_535)
{
    builder.WebHost.UseUrls($"http://0.0.0.0:{railwayPort}");
}

builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddDebug();

builder.Services
    .AddControllersWithViews(options =>
        options.Filters.Add(new AutoValidateAntiforgeryTokenAttribute()))
    .AddJsonOptions(options =>
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ApiExceptionHandler>();
var dataProtection = builder.Services
    .AddDataProtection()
    .SetApplicationName("Rolevya");
if (builder.Environment.IsDevelopment())
{
    var developmentKeysPath = Path.Combine(
        builder.Environment.ContentRootPath,
        ".data-protection-keys");
    Directory.CreateDirectory(developmentKeysPath);
    dataProtection.PersistKeysToFileSystem(new DirectoryInfo(developmentKeysPath));
}
else
{
    // Keeping the key ring in PostgreSQL preserves login and antiforgery cookies
    // across Railway deployments without requiring a writable container volume.
    dataProtection.PersistKeysToDbContext<JobTrackerDbContext>();
}
builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, HttpCurrentUser>();
builder.Services.AddAuthorization();
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders =
        ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = 1;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});
builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-CSRF-TOKEN";
    options.Cookie.Name = "Rolevya.Antiforgery";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
        ? CookieSecurePolicy.SameAsRequest
        : CookieSecurePolicy.Always;
});
if (!builder.Environment.IsDevelopment())
{
    builder.Services.ConfigureApplicationCookie(options =>
        options.Cookie.SecurePolicy = CookieSecurePolicy.Always);
}

var frontendOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>() ?? [];

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        if (frontendOrigins.Length > 0)
        {
            policy
                .WithOrigins(frontendOrigins)
                .AllowAnyHeader()
                .AllowAnyMethod()
                .AllowCredentials();
        }
    });
});

var app = builder.Build();

if (builder.Configuration.GetValue<bool>("Database:ApplyMigrationsOnStartup"))
{
    await using var scope = app.Services.CreateAsyncScope();
    var dbContext = scope.ServiceProvider.GetRequiredService<JobTrackerDbContext>();
    await dbContext.Database.OpenConnectionAsync();
    try
    {
        // Serializes migrations when Railway starts more than one replica.
        await dbContext.Database.ExecuteSqlRawAsync(
            "SELECT pg_advisory_lock(82467112026026);");
        await dbContext.Database.MigrateAsync();
    }
    finally
    {
        await dbContext.Database.ExecuteSqlRawAsync(
            "SELECT pg_advisory_unlock(82467112026026);");
        await dbContext.Database.CloseConnectionAsync();
    }
}

app.UseForwardedHeaders();
app.UseExceptionHandler();

if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

app.UseDefaultFiles();
app.UseStaticFiles();
app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "healthy" }))
    .AllowAnonymous();
app.MapGet(
        "/health/ready",
        async (JobTrackerDbContext dbContext, CancellationToken cancellationToken) =>
        {
            try
            {
                return await dbContext.Database.CanConnectAsync(cancellationToken)
                    ? Results.Ok(new { status = "ready" })
                    : Results.Json(
                        new { status = "unavailable" },
                        statusCode: StatusCodes.Status503ServiceUnavailable);
            }
            catch
            {
                return Results.Json(
                    new { status = "unavailable" },
                    statusCode: StatusCodes.Status503ServiceUnavailable);
            }
        })
    .AllowAnonymous();
app.MapControllers();
app.MapFallbackToFile("index.html");

app.Run();

public partial class Program;
