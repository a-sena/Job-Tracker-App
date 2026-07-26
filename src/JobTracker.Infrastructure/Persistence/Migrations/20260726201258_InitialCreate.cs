using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JobTracker.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "job_applications",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    job_url = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                    title = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    company = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    description = table.Column<string>(type: "text", nullable: false),
                    location = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_job_applications", x => x.id);
                    table.CheckConstraint("ck_job_applications_status", "status IN ('Applied', 'Interviewing', 'Offer', 'Rejected')");
                });

            migrationBuilder.CreateTable(
                name: "master_cvs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    content = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_master_cvs", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "tailored_cvs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    master_cv_id = table.Column<Guid>(type: "uuid", nullable: false),
                    job_application_id = table.Column<Guid>(type: "uuid", nullable: false),
                    summary = table.Column<string>(type: "text", nullable: false),
                    content = table.Column<string>(type: "text", nullable: false),
                    ats_match_score = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: false),
                    missing_keywords = table.Column<string[]>(type: "text[]", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tailored_cvs", x => x.id);
                    table.CheckConstraint("ck_tailored_cvs_ats_match_score", "ats_match_score >= 0 AND ats_match_score <= 100");
                    table.ForeignKey(
                        name: "FK_tailored_cvs_job_applications_job_application_id",
                        column: x => x.job_application_id,
                        principalTable: "job_applications",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_tailored_cvs_master_cvs_master_cv_id",
                        column: x => x.master_cv_id,
                        principalTable: "master_cvs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_job_applications_updated_at",
                table: "job_applications",
                column: "updated_at");

            migrationBuilder.CreateIndex(
                name: "ix_job_applications_user_id_status",
                table: "job_applications",
                columns: new[] { "user_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ux_master_cvs_user_id_name",
                table: "master_cvs",
                columns: new[] { "user_id", "name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_tailored_cvs_job_application_id",
                table: "tailored_cvs",
                column: "job_application_id");

            migrationBuilder.CreateIndex(
                name: "ix_tailored_cvs_master_cv_id",
                table: "tailored_cvs",
                column: "master_cv_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "tailored_cvs");

            migrationBuilder.DropTable(
                name: "job_applications");

            migrationBuilder.DropTable(
                name: "master_cvs");
        }
    }
}
