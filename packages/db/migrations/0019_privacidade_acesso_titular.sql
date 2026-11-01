CREATE TABLE "access_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"ip_address" text,
	"source_port" integer,
	"kind" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_closures" (
	"user_id" text PRIMARY KEY NOT NULL,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trail_badges" DROP CONSTRAINT "trail_badges_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "trail_badges" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "account_closures" ADD CONSTRAINT "account_closures_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_logs_user_idx" ON "access_logs" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "access_logs_ip_idx" ON "access_logs" USING btree ("ip_address","occurred_at");--> statement-breakpoint
CREATE INDEX "access_logs_occurred_idx" ON "access_logs" USING btree ("occurred_at");--> statement-breakpoint
ALTER TABLE "trail_badges" ADD CONSTRAINT "trail_badges_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;