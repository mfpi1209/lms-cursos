CREATE TYPE "public"."mission_status" AS ENUM('later', 'done');--> statement-breakpoint
CREATE TABLE "mission_response_events" (
	"id" text PRIMARY KEY NOT NULL,
	"response_id" text NOT NULL,
	"revision" integer NOT NULL,
	"status" "mission_status" NOT NULL,
	"note" text,
	"source" text DEFAULT 'lesson' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mission_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"enrollment_id" text NOT NULL,
	"user_id" text NOT NULL,
	"lesson_id" text NOT NULL,
	"node_id" text NOT NULL,
	"status" "mission_status" NOT NULL,
	"note" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"done_at" timestamp with time zone,
	CONSTRAINT "mission_responses_enrollment_node_uq" UNIQUE("enrollment_id","node_id")
);
--> statement-breakpoint
ALTER TABLE "mission_response_events" ADD CONSTRAINT "mission_response_events_response_id_mission_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."mission_responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_responses" ADD CONSTRAINT "mission_responses_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_responses" ADD CONSTRAINT "mission_responses_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mission_response_events_response_idx" ON "mission_response_events" USING btree ("response_id");--> statement-breakpoint
CREATE INDEX "mission_responses_user_idx" ON "mission_responses" USING btree ("user_id");