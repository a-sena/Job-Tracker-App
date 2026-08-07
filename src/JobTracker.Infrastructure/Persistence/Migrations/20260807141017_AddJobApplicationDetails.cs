using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JobTracker.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddJobApplicationDetails : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "personal_notes",
                table: "job_applications",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "recruiter_email",
                table: "job_applications",
                type: "character varying(320)",
                maxLength: 320,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "recruiter_linkedin_url",
                table: "job_applications",
                type: "character varying(2048)",
                maxLength: 2048,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "recruiter_name",
                table: "job_applications",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "salary_range",
                table: "job_applications",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "work_arrangement",
                table: "job_applications",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Unspecified");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "personal_notes",
                table: "job_applications");

            migrationBuilder.DropColumn(
                name: "recruiter_email",
                table: "job_applications");

            migrationBuilder.DropColumn(
                name: "recruiter_linkedin_url",
                table: "job_applications");

            migrationBuilder.DropColumn(
                name: "recruiter_name",
                table: "job_applications");

            migrationBuilder.DropColumn(
                name: "salary_range",
                table: "job_applications");

            migrationBuilder.DropColumn(
                name: "work_arrangement",
                table: "job_applications");
        }
    }
}
