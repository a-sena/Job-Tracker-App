using JobTracker.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace JobTracker.Infrastructure.Persistence.Configurations;

internal sealed class JobApplicationConfiguration : IEntityTypeConfiguration<JobApplication>
{
    public void Configure(EntityTypeBuilder<JobApplication> builder)
    {
        builder.ToTable(
            "job_applications",
            tableBuilder => tableBuilder.HasCheckConstraint(
                "ck_job_applications_status",
                "status IN ('Applied', 'Interviewing', 'Offer', 'Rejected')"));

        builder.HasKey(jobApplication => jobApplication.Id);

        builder.Property(jobApplication => jobApplication.Id)
            .HasColumnName("id")
            .ValueGeneratedNever();

        builder.Property(jobApplication => jobApplication.UserId)
            .HasColumnName("user_id")
            .IsRequired();

        builder.Property(jobApplication => jobApplication.JobUrl)
            .HasColumnName("job_url")
            .HasMaxLength(2048)
            .IsRequired();

        builder.Property(jobApplication => jobApplication.Title)
            .HasColumnName("title")
            .HasMaxLength(300)
            .IsRequired();

        builder.Property(jobApplication => jobApplication.Company)
            .HasColumnName("company")
            .HasMaxLength(200)
            .IsRequired();

        builder.Property(jobApplication => jobApplication.Description)
            .HasColumnName("description")
            .HasColumnType("text")
            .IsRequired();

        builder.Property(jobApplication => jobApplication.Location)
            .HasColumnName("location")
            .HasMaxLength(200);

        builder.Property(jobApplication => jobApplication.Status)
            .HasColumnName("status")
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(jobApplication => jobApplication.CreatedAt)
            .HasColumnName("created_at")
            .HasColumnType("timestamp with time zone")
            .IsRequired();

        builder.Property(jobApplication => jobApplication.UpdatedAt)
            .HasColumnName("updated_at")
            .HasColumnType("timestamp with time zone")
            .IsRequired();

        builder.HasIndex(jobApplication => new { jobApplication.UserId, jobApplication.Status })
            .HasDatabaseName("ix_job_applications_user_id_status");

        builder.HasIndex(jobApplication => jobApplication.UpdatedAt)
            .HasDatabaseName("ix_job_applications_updated_at");
    }
}
