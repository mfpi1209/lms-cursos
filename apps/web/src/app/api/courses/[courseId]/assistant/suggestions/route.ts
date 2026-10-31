import { AssistantContextSchema, promptSuggestions } from '@lms/ai';
import { route } from '@/server/http';
import { requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { loadDraft } from '../_lib/assistant';

/**
 * Sugestões de prompt para o contexto: `{ suggestions: PromptSuggestion[] }`
 * (no máximo 6). Query: `screen` (padrão course), `step`, `lessonId`, `nodeId`.
 * A UI também pode chamar `promptSuggestions` de `@lms/ai/client` direto.
 */
export async function GET(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireStaff();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const q = new URL(req.url).searchParams;
    const opt = (k: string) => q.get(k)?.trim() || undefined;
    const context = AssistantContextSchema.parse({ screen: opt('screen') ?? 'course', step: opt('step'), lessonId: opt('lessonId'), nodeId: opt('nodeId') });
    const draft = await loadDraft(courseId);
    return { suggestions: promptSuggestions(context, draft.document) };
  });
}
