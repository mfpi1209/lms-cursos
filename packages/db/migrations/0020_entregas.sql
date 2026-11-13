CREATE TYPE "public"."task_submission_status" AS ENUM('submitted', 'approved', 'returned');--> statement-breakpoint
CREATE TABLE "task_submission_events" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"revision" integer NOT NULL,
	"type" text NOT NULL,
	"status" "task_submission_status" NOT NULL,
	"link" text,
	"file_asset_id" text,
	"criteria_results" jsonb,
	"comment" text,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"course_id" text NOT NULL,
	"enrollment_id" text NOT NULL,
	"user_id" text NOT NULL,
	"lesson_id" text NOT NULL,
	"node_id" text NOT NULL,
	"course_version_id" text NOT NULL,
	"link" text NOT NULL,
	"file_asset_id" text,
	"status" "task_submission_status" DEFAULT 'submitted' NOT NULL,
	"criteria_results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reviewer_comment" text,
	"reviewer_id" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "task_submissions_enrollment_node_uq" UNIQUE("enrollment_id","node_id")
);
--> statement-breakpoint
ALTER TABLE "task_submission_events" ADD CONSTRAINT "task_submission_events_submission_id_task_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."task_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_course_version_id_course_versions_id_fk" FOREIGN KEY ("course_version_id") REFERENCES "public"."course_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_file_asset_id_assets_id_fk" FOREIGN KEY ("file_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_submission_events_submission_idx" ON "task_submission_events" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "task_submissions_queue_idx" ON "task_submissions" USING btree ("workspace_id","status","submitted_at");--> statement-breakpoint
CREATE INDEX "task_submissions_course_queue_idx" ON "task_submissions" USING btree ("course_id","status","submitted_at");--> statement-breakpoint
CREATE INDEX "task_submissions_user_idx" ON "task_submissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_submissions_file_idx" ON "task_submissions" USING btree ("file_asset_id");--> statement-breakpoint
CREATE INDEX "assets_task_upload_idx" ON "assets" USING btree ("created_by","created_at") WHERE "assets"."metadata" ? 'taskUpload';