CREATE TYPE "public"."library_template_kind" AS ENUM('kit', 'studio', 'presenter', 'voice', 'branding', 'direction', 'knowledge', 'learner');--> statement-breakpoint
CREATE TABLE "library_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" "library_template_kind" NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"data" jsonb NOT NULL,
	"preview_asset_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "library_templates_workspace_key_uq" UNIQUE("workspace_id","key")
);
--> statement-breakpoint
ALTER TABLE "library_templates" ADD CONSTRAINT "library_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_templates" ADD CONSTRAINT "library_templates_preview_asset_id_assets_id_fk" FOREIGN KEY ("preview_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_templates" ADD CONSTRAINT "library_templates_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "library_templates_workspace_kind_idx" ON "library_templates" USING btree ("workspace_id","kind");