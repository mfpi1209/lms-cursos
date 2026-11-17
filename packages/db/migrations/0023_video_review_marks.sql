CREATE TABLE "video_review_marks" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"course_id" text NOT NULL,
	"lesson_id" text NOT NULL,
	"node_id" text NOT NULL,
	"scene_time_sec" real NOT NULL,
	"draft_revision" integer NOT NULL,
	"scene_asset_id" text NOT NULL,
	"scene_hash" text,
	"category" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"expected" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" jsonb,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text
);
--> statement-breakpoint
ALTER TABLE "video_review_marks" ADD CONSTRAINT "video_review_marks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_review_marks" ADD CONSTRAINT "video_review_marks_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_review_marks" ADD CONSTRAINT "video_review_marks_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_review_marks" ADD CONSTRAINT "video_review_marks_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_review_marks_course_idx" ON "video_review_marks" USING btree ("course_id","lesson_id","status");--> statement-breakpoint
CREATE INDEX "video_review_marks_workspace_idx" ON "video_review_marks" USING btree ("workspace_id");