ALTER TABLE "video_review_marks" ADD COLUMN "fix_kind" text;--> statement-breakpoint
ALTER TABLE "video_review_marks" ADD COLUMN "brief" text;--> statement-breakpoint
ALTER TABLE "video_review_marks" ADD COLUMN "fix" jsonb;--> statement-breakpoint
ALTER TABLE "video_review_marks" ADD COLUMN "proposed" jsonb;--> statement-breakpoint
ALTER TABLE "video_review_marks" ADD COLUMN "approval_usd" real;--> statement-breakpoint
ALTER TABLE "video_review_marks" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "video_review_marks" ADD COLUMN "history" jsonb DEFAULT '[]'::jsonb NOT NULL;