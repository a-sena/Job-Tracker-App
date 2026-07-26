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

        builder.Property(masterCv => masterCv.CreatedAt)
            .HasColumnName("created_at")
            .HasColumnType("timestamp with time zone")
            .IsRequired();

        builder.Property(masterCv => masterCv.UpdatedAt)
            .HasColumnName("updated_at")
            .HasColumnType("timestamp with time zone")
            .IsRequired();

        builder.HasIndex(masterCv => new { masterCv.UserId, masterCv.Name })
            .IsUnique()
            .HasDatabaseName("ux_master_cvs_user_id_name");
    }
}
