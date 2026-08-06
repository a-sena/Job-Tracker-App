using JobTracker.Domain.Entities;
using JobTracker.Infrastructure.Identity;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace JobTracker.Infrastructure.Persistence;

public sealed class JobTrackerDbContext(DbContextOptions<JobTrackerDbContext> options)
    : IdentityDbContext<AppUser, IdentityRole<Guid>, Guid>(options), IDataProtectionKeyContext
{
    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();

    public DbSet<JobApplication> JobApplications => Set<JobApplication>();

    public DbSet<MasterCv> MasterCvs => Set<MasterCv>();

    public DbSet<TailoredCv> TailoredCvs => Set<TailoredCv>();

    public DbSet<ApplicationDraft> ApplicationDrafts => Set<ApplicationDraft>();

    public DbSet<ApplicationCategory> ApplicationCategories => Set<ApplicationCategory>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(JobTrackerDbContext).Assembly);

        modelBuilder.Entity<DataProtectionKey>(builder =>
        {
            builder.ToTable("data_protection_keys");
            builder.Property(key => key.Id).HasColumnName("id");
            builder.Property(key => key.FriendlyName).HasColumnName("friendly_name");
            builder.Property(key => key.Xml).HasColumnName("xml");
        });

        modelBuilder.Entity<AppUser>(builder =>
        {
            builder.ToTable("users");
            builder.Property(user => user.CreatedAt)
                .HasColumnName("created_at")
                .HasColumnType("timestamp with time zone")
                .IsRequired();
            builder.Property(user => user.UpdatedAt)
                .HasColumnName("updated_at")
                .HasColumnType("timestamp with time zone")
                .IsRequired();
            builder.Property(user => user.MembershipPlan)
                .HasColumnName("membership_plan")
                .HasMaxLength(32)
                .HasDefaultValue("Free")
                .IsRequired();
            builder.Property(user => user.MembershipStatus)
                .HasColumnName("membership_status")
                .HasMaxLength(32)
                .HasDefaultValue("Active")
                .IsRequired();
            builder.Property(user => user.MembershipStartedAt)
                .HasColumnName("membership_started_at")
                .HasColumnType("timestamp with time zone");
            builder.Property(user => user.MembershipRenewsAt)
                .HasColumnName("membership_renews_at")
                .HasColumnType("timestamp with time zone");
            builder.Property(user => user.StripeCustomerId)
                .HasColumnName("stripe_customer_id")
                .HasMaxLength(128);
            builder.Property(user => user.StripeSubscriptionId)
                .HasColumnName("stripe_subscription_id")
                .HasMaxLength(128);
            builder.Property(user => user.StripePriceId)
                .HasColumnName("stripe_price_id")
                .HasMaxLength(128);
            builder.Property(user => user.StripeLastEventId)
                .HasColumnName("stripe_last_event_id")
                .HasMaxLength(128);
            builder.Property(user => user.StripeLastEventCreatedAt)
                .HasColumnName("stripe_last_event_created_at")
                .HasColumnType("timestamp with time zone");
            builder.Property(user => user.AiUsagePeriodStartedAt)
                .HasColumnName("ai_usage_period_started_at")
                .HasColumnType("timestamp with time zone");
            builder.Property(user => user.AiActionsUsed)
                .HasColumnName("ai_actions_used")
                .HasDefaultValue(0)
                .IsRequired();
            builder.Property(user => user.FreeCvReviewsUsed)
                .HasColumnName("free_cv_reviews_used")
                .HasDefaultValue(0)
                .IsRequired();
            builder.Property(user => user.FreeCvTailorsUsed)
                .HasColumnName("free_cv_tailors_used")
                .HasDefaultValue(0)
                .IsRequired();
            builder.Property(user => user.FreeInterviewSetsUsed)
                .HasColumnName("free_interview_sets_used")
                .HasDefaultValue(0)
                .IsRequired();
            builder.Property(user => user.FreeCoverLettersUsed)
                .HasColumnName("free_cover_letters_used")
                .HasDefaultValue(0)
                .IsRequired();
            builder.HasIndex(user => user.StripeCustomerId)
                .IsUnique()
                .HasFilter("stripe_customer_id IS NOT NULL")
                .HasDatabaseName("ux_users_stripe_customer_id");
            builder.HasIndex(user => user.StripeSubscriptionId)
                .IsUnique()
                .HasFilter("stripe_subscription_id IS NOT NULL")
                .HasDatabaseName("ux_users_stripe_subscription_id");
        });
        modelBuilder.Entity<IdentityRole<Guid>>().ToTable("roles");
        modelBuilder.Entity<IdentityUserRole<Guid>>().ToTable("user_roles");
        modelBuilder.Entity<IdentityUserClaim<Guid>>().ToTable("user_claims");
        modelBuilder.Entity<IdentityUserLogin<Guid>>().ToTable("user_logins");
        modelBuilder.Entity<IdentityRoleClaim<Guid>>().ToTable("role_claims");
        modelBuilder.Entity<IdentityUserToken<Guid>>().ToTable("user_tokens");
    }
}
