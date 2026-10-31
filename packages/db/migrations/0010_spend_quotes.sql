CREATE TYPE "public"."media_quote_status" AS ENUM('open', 'consumed', 'expired');--> statement-breakpoint
CREATE TABLE "media_quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"course_id" text NOT NULL,
	"draft_revision" integer NOT NULL,
	"draft_hash" text NOT NULL,
	"status" "media_quote_status" DEFAULT 'open' NOT NULL,
	"simulated" integer DEFAULT 0 NOT NULL,
	"items" jsonb NOT NULL,
	"totals" jsonb NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone,
	"consumed_by" text
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "spend_limits" jsonb;--> statement-breakpoint
ALTER TABLE "media_jobs" ADD COLUMN "quote_id" text;--> statement-breakpoint
ALTER TABLE "media_jobs" ADD COLUMN "approved_by" text;--> statement-breakpoint
ALTER TABLE "media_jobs" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_quotes" ADD CONSTRAINT "media_quotes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_quotes" ADD CONSTRAINT "media_quotes_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_quotes_course_idx" ON "media_quotes" USING btree ("course_id","created_at");