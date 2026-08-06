using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JobTracker.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddStripeBilling : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "stripe_customer_id",
                table: "users",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "stripe_last_event_created_at",
                table: "users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "stripe_last_event_id",
                table: "users",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "stripe_price_id",
                table: "users",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "stripe_subscription_id",
                table: "users",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ux_users_stripe_customer_id",
                table: "users",
                column: "stripe_customer_id",
                unique: true,
                filter: "stripe_customer_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ux_users_stripe_subscription_id",
                table: "users",
                column: "stripe_subscription_id",
                unique: true,
                filter: "stripe_subscription_id IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_users_stripe_customer_id",
                table: "users");

            migrationBuilder.DropIndex(
                name: "ux_users_stripe_subscription_id",
                table: "users");

            migrationBuilder.DropColumn(
                name: "stripe_customer_id",
                table: "users");

            migrationBuilder.DropColumn(
                name: "stripe_last_event_created_at",
                table: "users");

            migrationBuilder.DropColumn(
                name: "stripe_last_event_id",
                table: "users");

            migrationBuilder.DropColumn(
                name: "stripe_price_id",
                table: "users");

            migrationBuilder.DropColumn(
                name: "stripe_subscription_id",
                table: "users");
        }
    }
}
