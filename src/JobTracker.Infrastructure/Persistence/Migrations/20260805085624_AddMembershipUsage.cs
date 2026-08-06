using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JobTracker.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMembershipUsage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ai_actions_used",
                table: "users",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ai_usage_period_started_at",
                table: "users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "free_cover_letters_used",
                table: "users",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "free_cv_reviews_used",
                table: "users",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "free_cv_tailors_used",
                table: "users",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "free_interview_sets_used",
                table: "users",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "membership_plan",
                table: "users",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Free");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "membership_renews_at",
                table: "users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "membership_started_at",
                table: "users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "membership_status",
                table: "users",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Active");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ai_actions_used",
                table: "users");

            migrationBuilder.DropColumn(
                name: "ai_usage_period_started_at",
                table: "users");

            migrationBuilder.DropColumn(
                name: "free_cover_letters_used",
                table: "users");

            migrationBuilder.DropColumn(
                name: "free_cv_reviews_used",
                table: "users");

            migrationBuilder.DropColumn(
                name: "free_cv_tailors_used",
                table: "users");

            migrationBuilder.DropColumn(
                name: "free_interview_sets_used",
                table: "users");

            migrationBuilder.DropColumn(
                name: "membership_plan",
                table: "users");

            migrationBuilder.DropColumn(
                name: "membership_renews_at",
                table: "users");

            migrationBuilder.DropColumn(
                name: "membership_started_at",
                table: "users");

            migrationBuilder.DropColumn(
                name: "membership_status",
                table: "users");
        }
    }
}
