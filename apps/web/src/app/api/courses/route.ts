import { z } from 'zod';
import { getDb, authoring, library } from '@lms/db';
import { CourseBriefSchema, emptyCourseDocument } from '@lms/course-schema';
import { parseBody, route } from '@/server/http';
import { requireEditor, requireStaff } from '@/server/viewer';

export async function GET() {
  return route(async () => {
    const viewer = await requireStaff();
    return { courses: await authoring.listCourses(getDb(), viewer.workspace.id) };
  });
}

const CreateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  brief: CourseBriefSchema.partial().optional(),
  /** kit da biblioteca de modelos (estúdio, instrutor, voz, marca, direção); só dados, nada é gerado */
  kit: z.string().trim().min(1).max(80).optional(),
});

/**
 * Cria o curso a partir do briefing de /estudio/novo. Esse formulário É o passo
 * "Ideia e público" do assistente: o rascunho já nasce com ele concluído e
 * aberto no passo seguinte (Material), para o autor não preencher duas vezes.
 * Com `kit`, a apresentação e a marca já vêm da biblioteca de modelos.
 */
export async function POST(req: Request) {
  return route(async () => {
    const viewer = await requireEditor();
    const { title, brief, kit } = await parseBody(req, CreateSchema);
    let document = emptyCourseDocument(title);
    if (brief) document.brief = CourseBriefSchema.parse({ ...document.brief, ...brief });
    const briefed = !!document.brief.topic.trim();
    if (briefed) document.wizard = { ...document.wizard, step: 'conteudo', completedSteps: ['tema'] };
    // o curso já nasce com o kit (recusado com mensagem clara se o kit estiver incompleto)
    if (kit) document = (await library.documentWithTemplate(getDb(), viewer.workspace.id, document, kit)).document;
    return authoring.createCourse(getDb(), { workspaceId: viewer.workspace.id, title, createdBy: viewer.user.id, document });
  });
}
