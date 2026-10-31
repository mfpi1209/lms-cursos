CREATE TYPE "public"."asset_kind" AS ENUM('image', 'audio', 'video');--> statement-breakpoint
CREATE TYPE "public"."asset_source" AS ENUM('upload', 'generated');--> statement-breakpoint
CREATE TYPE "public"."media_job_kind" AS ENUM('video', 'voice');--> statement-breakpoint
CREATE TYPE "public"."media_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'canceled', 'reconciliation_required');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"source" "asset_source" DEFAULT 'upload' NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"storage_provider" text NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text,
	"sha256" text NOT NULL,
	"duration_seconds" real,
	"transcript" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"course_id" text NOT NULL,
	"lesson_id" text NOT NULL,
	"node_id" text NOT NULL,
	"kind" "media_job_kind" NOT NULL,
	"provider" text NOT NULL,
	"adapter_version" text NOT NULL,
	"scene_hash" text NOT NULL,
	"request_id" text NOT NULL,
	"status" "media_job_status" DEFAULT 'queued' NOT NULL,
	"input" jsonb NOT NULL,
	"external_id" text,
	"output_asset_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"cost_estimated_usd" real,
	"cost_actual_usd" real,
	"simulated" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_jobs_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_jobs" ADD CONSTRAINT "media_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_jobs" ADD CONSTRAINT "media_jobs_output_asset_id_assets_id_fk" FOREIGN KEY ("output_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_jobs" ADD CONSTRAINT "media_jobs_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_workspace_idx" ON "assets" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "assets_sha256_idx" ON "assets" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "media_jobs_scene_idx" ON "media_jobs" USING btree ("scene_hash","provider");--> statement-breakpoint
CREATE INDEX "media_jobs_node_idx" ON "media_jobs" USING btree ("course_id","lesson_id","node_id");--> statement-breakpoint
CREATE INDEX "media_jobs_status_idx" ON "media_jobs" USING btree ("status");