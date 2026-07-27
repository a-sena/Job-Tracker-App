using JobTracker.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace JobTracker.Infrastructure.Persistence.Configurations;

internal sealed class TailoredCvConfiguration : IEntityTypeConfiguration<TailoredCv>
{
    public void Configure(EntityTypeBuilder<TailoredCv> builder)
    {
        builder.ToTable(
            "tailored_cvs",
            tableBuilder => tableBuilder.HasCheckConstraint(
                "ck_tailored_cvs_ats_match_score",
                "ats_match_score >= 0 AND ats_match_score <= 100"));

        builder.HasKey(tailoredCv => tailoredCv.Id);

        builder.Property(tailoredCv => tailoredCv.Id)
            .HasColumnName("id")
            .ValueGeneratedNever();

        builder.Property(tailoredCv => tailoredCv.MasterCvId)
            .HasColumnName("master_cv_id")
            .IsRequired();

        builder.Property(tailoredCv => tailoredCv.JobApplicationId)
            .HasColumnName("job_application_id")
            .IsRequired();

        builder.Property(tailoredCv => tailoredCv.Summary)
            .HasColumnName("summary")
            .HasColumnType("text")
            .IsRequired();

        builder.Property(tailoredCv => tailoredCv.Content)
            .HasColumnName("content")
            .HasColumnType("text")
            .IsRequired();

        builder.Property(tailoredCv => tailoredCv.AtsMatchScore)
            .HasColumnName("ats_match_score")
            .HasPrecision(5, 2)
            .IsRequired();

        builder.Property(tailoredCv => tailoredCv.MissingKeywords)
            .HasColumnName("missing_keywords")
            .HasColumnType("text[]")
            .IsRequired();

        builder.Property(tailoredCv => tailoredCv.PdfContent)
            .HasColumnName("pdf_content")
            .HasColumnType("bytea")
            .IsRequired();

        builder.Property(tailoredCv => tailoredCv.PdfFileName)
            .HasColumnName("pdf_file_name")
            .HasMaxLength(255)
            .IsRequired();

        builder.Property(tailoredCv => tailoredCv.CreatedAt)
            .HasColumnName("created_at")
            .HasColumnType("timestamp with time zone")
            .IsRequired();

        builder.Property(tailoredCv => tailoredCv.UpdatedAt)
            .HasColumnName("updated_at")
            .HasColumnType("timestamp with time zone")
            .IsRequired();

        builder.HasOne(tailoredCv => tailoredCv.MasterCv)
            .WithMany(masterCv => masterCv.TailoredCvs)
            .HasForeignKey(tailoredCv => tailoredCv.MasterCvId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(tailoredCv => tailoredCv.JobApplication)
            .WithMany(jobApplication => jobApplication.TailoredCvs)
            .HasForeignKey(tailoredCv => tailoredCv.JobApplicationId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(tailoredCv => tailoredCv.MasterCvId)
            .HasDatabaseName("ix_tailored_cvs_master_cv_id");

        builder.HasIndex(tailoredCv => tailoredCv.JobApplicationId)
            .HasDatabaseName("ix_tailored_cvs_job_application_id");
    }
}
