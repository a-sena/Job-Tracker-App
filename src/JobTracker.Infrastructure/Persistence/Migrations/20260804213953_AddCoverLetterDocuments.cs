using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JobTracker.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCoverLetterDocuments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "cover_letter_content",
                table: "application_drafts",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<byte[]>(
                name: "cover_letter_pdf",
                table: "application_drafts",
                type: "bytea",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "cover_letter_pdf_file_name",
                table: "application_drafts",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "cover_letter_content",
                table: "application_drafts");

            migrationBuilder.DropColumn(
                name: "cover_letter_pdf",
                table: "application_drafts");

            migrationBuilder.DropColumn(
                name: "cover_letter_pdf_file_name",
                table: "application_drafts");
        }
    }
}
