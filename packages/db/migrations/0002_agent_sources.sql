CREATE TYPE "public"."agent_run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."agent_task" AS ENUM('outline', 'lesson');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('proposed', 'applied', 'rejected', 'conflict');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('paste', 'txt', 'md', 'pdf');--> statement-breakpoint
CREATE TYPE "public"."source_status" AS ENUM('processing', 'ready', 'needs_ocr', 'failed');--> statement-breakpoint
CREATE TABLE "agent_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"course_id" text NOT NULL,
	"kind" "agent_task" NOT NULL,
	"lesson_id" text,
	"base_revision" integer NOT NULL,
	"status" "proposal_status" DEFAULT 'proposed' NOT NULL,
	"payload" jsonb NOT NULL,
	"rationale" text DEFAULT '' NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"applied_revision" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"course_id" text NOT NULL,
	"task" "agent_task" NOT NULL,
	"lesson_id" text,
	"status" "agent_run_status" DEFAULT 'queued' NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"instructions_version" text NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"latency_ms" integer,
	"usage" jsonb,
	"cost_usd" real,
	"fallback_used" boolean DEFAULT false NOT NULL,
	"repairs" integer DEFAULT 0 NOT NULL,
	"error" text,
	"proposal_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "source_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"index" integer NOT NULL,
	"page" integer,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"course_id" text NOT NULL,
	"title" text NOT NULL,
	"kind" "source_kind" NOT NULL,
	"status" "source_status" DEFAULT 'processing' NOT NULL,
	"asset_id" text,
	"original_name" text,
	"sha256" text,
	"declared_origin" text,
	"text" text,
	"chars" integer DEFAULT 0 NOT NULL,
	"pages" integer,
	"excerpt" text,
	"error" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agent_proposals" ADD CONSTRAINT "agent_proposals_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_proposals" ADD CONSTRAINT "agent_proposals_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_chunks" ADD CONSTRAINT "source_chunks_source_id_source_documents_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_proposals_course_idx" ON "agent_proposals" USING btree ("course_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_runs_course_idx" ON "agent_runs" USING btree ("course_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_runs_status_idx" ON "agent_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "source_chunks_source_idx" ON "source_chunks" USING btree ("source_id","index");--> statement-breakpoint
CREATE INDEX "source_documents_course_idx" ON "source_documents" USING btree ("course_id");