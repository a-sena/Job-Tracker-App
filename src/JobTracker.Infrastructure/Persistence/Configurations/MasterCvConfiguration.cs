using JobTracker.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace JobTracker.Infrastructure.Persistence.Configurations;

internal sealed class MasterCvConfiguration : IEntityTypeConfiguration<MasterCv>
{
    public void Configure(EntityTypeBuilder<MasterCv> builder)
    {
        builder.ToTable("master_cvs");

        builder.HasKey(masterCv => masterCv.Id);

        builder.Property(masterCv => masterCv.Id)
            .HasColumnName("id")
            .ValueGeneratedNever();

        builder.Property(masterCv => masterCv.UserId)
            .HasColumnName("user_id")
            .IsRequired();

        builder.Property(masterCv => masterCv.Name)
            .HasColumnName("name")
            .HasMaxLength(150)
            .IsRequired();

        builder.Property(masterCv => masterCv.Content)
            .HasColumnName("content")
            .HasColumnType("text")
            .IsRequired();

        builder.Property(masterCv => masterCv.OriginalPdf)
            .HasColumnName("original_pdf")
            .HasColumnType("bytea");

        builder.Property(masterCv => masterCv.OriginalFileName)
            .HasColumnName("original_file_name")
            .HasMaxLength(255);

        builder.Property(masterCv => masterCv.IsDefault)
            .HasColumnName("is_default")
            .HasDefaultValue(false)
            .IsRequired();

        builder.Property(masterCv => masterCv.CreatedAt)
            .HasColumnName("created_at")
            .HasColumnType("timestamp with time zone")
            .IsRequired();

        builder.Property(masterCv => masterCv.UpdatedAt)
            .HasColumnName("updated_at")
            .HasColumnType("timestamp with time zone")
            .IsRequired();

        builder.HasIndex(masterCv => masterCv.UserId)
            .HasDatabaseName("ix_master_cvs_user_id");

        builder.HasIndex(masterCv => masterCv.UserId)
            .IsUnique()
            .HasFilter("is_default")
            .HasDatabaseName("ux_master_cvs_user_default");
    }
}
