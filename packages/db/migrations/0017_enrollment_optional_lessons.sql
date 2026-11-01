ALTER TABLE "enrollments" ADD COLUMN "optional_lesson_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "completed_version_number" integer;--> statement-breakpoint
-- matrículas já concluídas: a declaração passa a citar a versão em que concluíram (a da matrícula hoje)
UPDATE "enrollments" e SET "completed_version_number" = v."version_number" FROM "course_versions" v WHERE v."id" = e."course_version_id" AND e."status" = 'completed';
