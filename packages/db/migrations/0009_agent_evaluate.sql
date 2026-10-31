ALTER TYPE "public"."agent_task" ADD VALUE 'evaluate_lesson';--> statement-breakpoint
CREATE TABLE "lesson_quality" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"lesson_id" text NOT NULL,
	"draft_revision" integer NOT NULL,
	"run_id" text,
	"proposal_id" text,
	"scorecard" jsonb NOT NULL,
	"overall" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_quality" ADD CONSTRAINT "lesson_quality_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_quality" ADD CONSTRAINT "lesson_quality_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_quality" ADD CONSTRAINT "lesson_quality_proposal_id_agent_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."agent_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_quality_lesson_uq" ON "lesson_quality" USING btree ("course_id","lesson_id");--> statement-breakpoint
CREATE INDEX "lesson_quality_course_idx" ON "lesson_quality" USING btree ("course_id");