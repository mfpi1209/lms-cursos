CREATE TABLE "trail_badges" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"trail_key" text NOT NULL,
	"trail_name" text NOT NULL,
	"holder_name" text NOT NULL,
	"competencies" jsonb NOT NULL,
	"courses" jsonb NOT NULL,
	"check_attempt_id" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "trail_badges_code_uq" UNIQUE("code"),
	CONSTRAINT "trail_badges_user_trail_uq" UNIQUE("user_id","trail_key")
);
--> statement-breakpoint
CREATE TABLE "trail_check_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"trail_key" text NOT NULL,
	"trail_name" text NOT NULL,
	"answers" jsonb NOT NULL,
	"correct" integer NOT NULL,
	"total" integer NOT NULL,
	"passed" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trail_badges" ADD CONSTRAINT "trail_badges_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trail_badges" ADD CONSTRAINT "trail_badges_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trail_badges" ADD CONSTRAINT "trail_badges_check_attempt_id_trail_check_attempts_id_fk" FOREIGN KEY ("check_attempt_id") REFERENCES "public"."trail_check_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trail_check_attempts" ADD CONSTRAINT "trail_check_attempts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trail_check_attempts" ADD CONSTRAINT "trail_check_attempts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trail_badges_workspace_idx" ON "trail_badges" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "trail_check_attempts_user_trail_idx" ON "trail_check_attempts" USING btree ("user_id","trail_key");