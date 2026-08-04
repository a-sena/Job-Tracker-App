using JobTracker.Domain.Entities;

namespace JobTracker.Application.Abstractions.Persistence;

public interface IApplicationDraftRepository
{
    Task<ApplicationDraft> GetOrCreateActiveAsync(
        Guid userId,
        CancellationToken cancellationToken = default);

    Task<ApplicationDraft?> GetActiveByUserIdAsync(
        Guid userId,
        bool asTracking = false,
        CancellationToken cancellationToken = default);

    Task<ApplicationDraft?> GetByIdAsync(
        Guid id,
        bool asTracking = false,
        CancellationToken cancellationToken = default);

    Task<ApplicationDraft?> GetByLoggedJobApplicationIdAsync(
        Guid jobApplicationId,
        CancellationToken cancellationToken = default);

    Task AddAsync(ApplicationDraft draft, CancellationToken cancellationToken = default);

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
