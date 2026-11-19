CREATE TABLE "course_certificates" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"workspace_id" text NOT NULL,
	"course_id" text NOT NULL,
	"course_version_id" text,
	"enrollment_id" text,
	"user_id" text,
	"holder_name" text NOT NULL,
	"holder_rgm" text,
	"course_title" text NOT NULL,
	"workload_minutes" integer NOT NULL,
	"program" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"issuer" jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	CONSTRAINT "course_certificates_code_uq" UNIQUE("code"),
	CONSTRAINT "course_certificates_enrollment_uq" UNIQUE("enrollment_id")
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "certificate_issuer" jsonb;--> statement-breakpoint
ALTER TABLE "course_certificates" ADD CONSTRAINT "course_certificates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_certificates" ADD CONSTRAINT "course_certificates_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_certificates" ADD CONSTRAINT "course_certificates_course_version_id_course_versions_id_fk" FOREIGN KEY ("course_version_id") REFERENCES "public"."course_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_certificates" ADD CONSTRAINT "course_certificates_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_certificates" ADD CONSTRAINT "course_certificates_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_certificates_user_idx" ON "course_certificates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "course_certificates_course_idx" ON "course_certificates" USING btree ("course_id");