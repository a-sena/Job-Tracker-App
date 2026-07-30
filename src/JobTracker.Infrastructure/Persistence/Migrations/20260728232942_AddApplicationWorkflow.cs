using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JobTracker.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddApplicationWorkflow : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_master_cvs_user_id_name",
                table: "master_cvs");

            migrationBuilder.AddColumn<bool>(
                name: "is_default",
                table: "master_cvs",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "original_file_name",
                table: "master_cvs",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<byte[]>(
                name: "original_pdf",
                table: "master_cvs",
                type: "bytea",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "category_id",
                table: "job_applications",
                type: "uuid",
                nullable: true);

            migrationBuilder.Sql(
                """
                UPDATE master_cvs AS cv
                SET is_default = TRUE
                WHERE cv.id = (
                    SELECT candidate.id
                    FROM master_cvs AS candidate
                    WHERE candidate.user_id = cv.user_id
                    ORDER BY candidate.updated_at DESC, candidate.id
                    LIMIT 1
                );
                """);

            migrationBuilder.CreateTable(
                name: "application_categories",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_application_categories", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "application_drafts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    master_cv_id = table.Column<Guid>(type: "uuid", nullable: true),
                    job_url = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    job_title = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    company = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    job_description = table.Column<string>(type: "text", nullable: true),
                    location = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    original_ats_score = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    original_matched_keywords = table.Column<string[]>(type: "jsonb", nullable: false),
                    original_missing_keywords = table.Column<string[]>(type: "jsonb", nullable: false),
                    ats_explanation = table.Column<string>(type: "text", nullable: true),
                    tailored_content = table.Column<string>(type: "jsonb", nullable: true),
                    tailored_ats_score = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    tailored_matched_keywords = table.Column<string[]>(type: "jsonb", nullable: false),
                    tailored_missing_keywords = table.Column<string[]>(type: "jsonb", nullable: false),
                    tailored_pdf = table.Column<byte[]>(type: "bytea", nullable: true),
                    tailored_pdf_file_name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    interview_questions = table.Column<string[]>(type: "jsonb", nullable: false),
                    interview_questions_pdf = table.Column<byte[]>(type: "bytea", nullable: true),
                    interview_questions_pdf_file_name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    logged_job_application_id = table.Column<Guid>(type: "uuid", nullable: true),
                    completed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_application_drafts", x => x.id);
                    table.CheckConstraint("ck_application_drafts_original_ats_score", "original_ats_score IS NULL OR (original_ats_score >= 0 AND original_ats_score <= 100)");
                    table.CheckConstraint("ck_application_drafts_tailored_ats_score", "tailored_ats_score IS NULL OR (tailored_ats_score >= 0 AND tailored_ats_score <= 100)");
                    table.ForeignKey(
                        name: "FK_application_drafts_job_applications_logged_job_application_~",
                        column: x => x.logged_job_application_id,
                        principalTable: "job_applications",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_application_drafts_master_cvs_master_cv_id",
                        column: x => x.master_cv_id,
                        principalTable: "master_cvs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ux_master_cvs_user_default",
                table: "master_cvs",
                column: "user_id",
                unique: true,
                filter: "is_default");

            migrationBuilder.CreateIndex(
                name: "ix_job_applications_category_id",
                table: "job_applications",
                column: "category_id");

            migrationBuilder.CreateIndex(
                name: "ux_application_categories_user_id_name",
                table: "application_categories",
                columns: new[] { "user_id", "name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_application_drafts_logged_job_application_id",
                table: "application_drafts",
                column: "logged_job_application_id");

            migrationBuilder.CreateIndex(
                name: "ix_application_drafts_master_cv_id",
                table: "application_drafts",
                column: "master_cv_id");

            migrationBuilder.CreateIndex(
                name: "ux_application_drafts_user_active",
                table: "application_drafts",
                column: "user_id",
                unique: true,
                filter: "completed_at IS NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_job_applications_application_categories_category_id",
                table: "job_applications",
                column: "category_id",
                principalTable: "application_categories",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_job_applications_application_categories_category_id",
                table: "job_applications");

            migrationBuilder.DropTable(
                name: "application_categories");

            migrationBuilder.DropTable(
                name: "application_drafts");

            migrationBuilder.DropIndex(
                name: "ux_master_cvs_user_default",
                table: "master_cvs");

            migrationBuilder.DropIndex(
                name: "ix_job_applications_category_id",
                table: "job_applications");

            migrationBuilder.DropColumn(
                name: "is_default",
                table: "master_cvs");

            migrationBuilder.DropColumn(
                name: "original_file_name",
                table: "master_cvs");

            migrationBuilder.DropColumn(
                name: "original_pdf",
                table: "master_cvs");

            migrationBuilder.DropColumn(
                name: "category_id",
                table: "job_applications");

            migrationBuilder.CreateIndex(
                name: "ux_master_cvs_user_id_name",
                table: "master_cvs",
                columns: new[] { "user_id", "name" },
                unique: true);
        }
    }
}
