using JobTracker.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace JobTracker.Infrastructure.Persistence.Configurations;

internal sealed class ApplicationDraftConfiguration
    : IEntityTypeConfiguration<ApplicationDraft>
{
    public void Configure(EntityTypeBuilder<ApplicationDraft> builder)
    {
        builder.ToTable(
            "application_drafts",
            table =>
            {
                table.HasCheckConstraint(
                    "ck_application_drafts_original_ats_score",
                    "original_ats_score IS NULL OR (original_ats_score >= 0 AND original_ats_score <= 100)");
                table.HasCheckConstraint(
                    "ck_application_drafts_tailored_ats_score",
                    "tailored_ats_score IS NULL OR (tailored_ats_score >= 0 AND tailored_ats_score <= 100)");
            });

        builder.HasKey(draft => draft.Id);
        builder.Property(draft => draft.Id).HasColumnName("id").ValueGeneratedNever();
        builder.Property(draft => draft.UserId).HasColumnName("user_id").IsRequired();
        builder.Property(draft => draft.MasterCvId).HasColumnName("master_cv_id");
        builder.Property(draft => draft.JobUrl).HasColumnName("job_url").HasMaxLength(2048);
        builder.Property(draft => draft.JobTitle).HasColumnName("job_title").HasMaxLength(300);
        builder.Property(draft => draft.Company).HasColumnName("company").HasMaxLength(200);
        builder.Property(draft => draft.JobDescription).HasColumnName("job_description").HasColumnType("text");
        builder.Property(draft => draft.Location).HasColumnName("location").HasMaxLength(200);
        builder.Property(draft => draft.OriginalAtsScore)
            .HasColumnName("original_ats_score").HasPrecision(5, 2);
        builder.Property(draft => draft.OriginalMatchedKeywords)
            .HasColumnName("original_matched_keywords").HasColumnType("jsonb").IsRequired();
        builder.Property(draft => draft.OriginalMissingKeywords)
            .HasColumnName("original_missing_keywords").HasColumnType("jsonb").IsRequired();
        builder.Property(draft => draft.AtsExplanation)
            .HasColumnName("ats_explanation").HasColumnType("text");
        builder.Property(draft => draft.TailoredContent)
            .HasColumnName("tailored_content").HasColumnType("jsonb");
        builder.Property(draft => draft.TailoredAtsScore)
            .HasColumnName("tailored_ats_score").HasPrecision(5, 2);
        builder.Property(draft => draft.TailoredMatchedKeywords)
            .HasColumnName("tailored_matched_keywords").HasColumnType("jsonb").IsRequired();
        builder.Property(draft => draft.TailoredMissingKeywords)
            .HasColumnName("tailored_missing_keywords").HasColumnType("jsonb").IsRequired();
        builder.Property(draft => draft.TailoredPdf)
            .HasColumnName("tailored_pdf").HasColumnType("bytea");
        builder.Property(draft => draft.TailoredPdfFileName)
            .HasColumnName("tailored_pdf_file_name").HasMaxLength(255);
        builder.Property(draft => draft.InterviewQuestions)
            .HasColumnName("interview_questions").HasColumnType("jsonb").IsRequired();
        builder.Property(draft => draft.InterviewQuestionsPdf)
            .HasColumnName("interview_questions_pdf").HasColumnType("bytea");
        builder.Property(draft => draft.InterviewQuestionsPdfFileName)
            .HasColumnName("interview_questions_pdf_file_name").HasMaxLength(255);
        builder.Property(draft => draft.LoggedJobApplicationId)
            .HasColumnName("logged_job_application_id");
        builder.Property(draft => draft.CompletedAt)
            .HasColumnName("completed_at").HasColumnType("timestamp with time zone");
        builder.Property(draft => draft.CreatedAt)
            .HasColumnName("created_at").HasColumnType("timestamp with time zone").IsRequired();
        builder.Property(draft => draft.UpdatedAt)
            .HasColumnName("updated_at").HasColumnType("timestamp with time zone").IsRequired();

        builder.HasOne(draft => draft.MasterCv)
            .WithMany()
            .HasForeignKey(draft => draft.MasterCvId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(draft => draft.LoggedJobApplication)
            .WithMany()
            .HasForeignKey(draft => draft.LoggedJobApplicationId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(draft => draft.MasterCvId)
            .HasDatabaseName("ix_application_drafts_master_cv_id");
        builder.HasIndex(draft => draft.LoggedJobApplicationId)
            .HasDatabaseName("ix_application_drafts_logged_job_application_id");
        builder.HasIndex(draft => draft.UserId)
            .IsUnique()
            .HasFilter("completed_at IS NULL")
            .HasDatabaseName("ux_application_drafts_user_active");
    }
}
