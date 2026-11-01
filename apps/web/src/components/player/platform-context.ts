import { allLessons, ownImageUrl, type CourseDocument, type EndNode } from '@lms/course-schema';
import type { BrandMark } from '@/config/brand';
import type { LessonRunStatus, PlatformBumper, PlatformContext, RecapNodeRef } from './types';

/** Vinheta padrão do workspace (asset com `metadata.bumper.default`) e a marca, resolvidas pelo servidor. */
export interface DefaultBumperInput {
  assetId: string;
  assetIdVertical?: string;
  durationSec?: number;
  logoLight?: string;
  logoDark?: string;
  brandName?: string;
  /** fundo da vinheta efetiva (padrão ou a do curso), quando conhecido */
  bg?: string;
}

/**
 * Vinheta efetiva do curso: a do documento (`branding.bumper.assetId`) ou a
 * padrão do workspace; `playOn`/`skippable` vêm do documento (padrão: só no
 * fim do curso, pulável). Sem asset em lugar nenhum, nada toca.
 */
export function resolveBumper(document: CourseDocument, lessonId: string, defaults?: DefaultBumperInput | null): PlatformBumper | undefined {
  const b = document.branding.bumper;
  const assetId = b?.assetId || defaults?.assetId;
  if (!assetId) return undefined;
  const lessons = allLessons(document);
  const assetIdVertical = b?.assetId ? b.assetIdVertical : defaults?.assetIdVertical;
  return {
    assetId,
    ...(assetIdVertical ? { assetIdVertical } : {}),
    playOn: b?.playOn ?? ['course_end'],
    skippable: b?.skippable ?? true,
    ...(defaults?.durationSec && !b?.assetId ? { durationSec: defaults.durationSec } : {}),
    isLastLesson: lessons.length > 0 && lessons[lessons.length - 1]!.id === lessonId,
    ...(defaults?.logoLight ? { logoLight: defaults.logoLight } : {}),
    ...(defaults?.logoDark ? { logoDark: defaults.logoDark } : {}),
    ...(defaults?.brandName ? { brandName: defaults.brandName } : {}),
    ...(defaults?.bg ? { bg: defaults.bg } : {}),
  };
}

/** A vinheta deve tocar nesta aula? (`lesson_end` em qualquer aula; `course_end` só na última) */
export function bumperPlaysHere(bumper: PlatformBumper | undefined): boolean {
  if (!bumper) return false;
  return bumper.playOn.includes('lesson_end') || (bumper.playOn.includes('course_end') && bumper.isLastLesson);
}

/**
 * Monta (no servidor) o contexto do player da plataforma. Puro e serializável:
 * usado pela página da aula no LMS e pela prévia do estúdio.
 *
 * Tema: a plataforma usa o palco escuro em TODOS os cursos. O schema grava
 * `theme: 'classic'` como padrão em documentos antigos, então o valor salvo não
 * distingue escolha de padrão: o visual clássico fica só como reserva, pedido
 * explicitamente na URL (`?player=classic`).
 */
export function buildPlatformContext({
  document,
  lessonId,
  hrefFor,
  statuses = {},
  enrollmentId,
  forceClassic = false,
  defaultBumper,
  brandMark,
}: {
  document: CourseDocument;
  lessonId: string;
  hrefFor: (lessonId: string) => string;
  statuses?: Record<string, LessonRunStatus>;
  enrollmentId?: string;
  forceClassic?: boolean;
  /** vinheta padrão do workspace (+ logos da marca), quando o curso não define a sua */
  defaultBumper?: DefaultBumperInput | null;
  /** logo da marca do workspace para o canto esquerdo do cabeçalho */
  brandMark?: BrandMark;
}): PlatformContext {
  const lessons = allLessons(document);
  const bumper = resolveBumper(document, lessonId, defaultBumper);

  // Roteiro do curso: o encerramento com recap da aula atual; senão, o primeiro do curso.
  const ends: Array<{ lessonId: string; endNode: EndNode }> = [];
  for (const l of lessons) {
    for (const n of l.graph.nodes) if (n.type === 'end' && n.recap && n.recap.length > 0) ends.push({ lessonId: l.id, endNode: n });
  }
  const chosen = ends.find((e) => e.lessonId === lessonId) ?? ends[0];
  let recap: PlatformContext['recap'];
  if (chosen) {
    const wanted = new Set(chosen.endNode.recap!.flatMap((r) => [r.nodeId, ...(r.nodeIds ?? []), ...(r.composedNodeIds ?? [])]).filter((x): x is string => !!x));
    const nodes: Record<string, RecapNodeRef> = {};
    for (const l of lessons) {
      for (const n of l.graph.nodes) {
        if (!wanted.has(n.id)) continue;
        nodes[n.id] = {
          title: n.title,
          type: n.type,
          options: n.type === 'choice' ? n.options.map((o) => ({ id: o.id, label: o.label })) : undefined,
          ...(n.type === 'mission' ? { mission: { intro: n.intro, action: n.action, alternative: n.alternative } } : {}),
        };
      }
    }
    recap = { lessonId: chosen.lessonId, endNode: chosen.endNode, nodes };
  }

  return {
    theme: forceClassic ? 'classic' : 'immersive',
    branding: { ...document.branding },
    ...(brandMark ? { brandMark } : {}),
    courseTitle: document.title,
    // só do nosso domínio (privacidade do aluno): retrato com link de provedor não é pedido pelo navegador
    posterUrl: ownImageUrl(document.presentation.avatarPreviewUrl),
    presenterPlacement: document.presentation.presenterPlacement ?? 'center',
    presenterPronoun: document.presentation.presenterPronoun,
    castPresenter: presenterFromCast(document),
    lessons: lessons.map((l) => ({ id: l.id, title: l.title, status: statuses[l.id] ?? 'not_started', href: hrefFor(l.id) })),
    currentLessonId: lessonId,
    courseGoals: (document.objectives ?? []).map((o) => o.title.trim()).filter(Boolean).slice(0, 4),
    ...(document.learnerSummary?.trim() ? { courseSummary: document.learnerSummary.trim() } : {}),
    enrollmentId,
    recap,
    ...(bumper ? { bumper } : {}),
  };
}

const PRESENTER_ROLE = /apresentador|apresentadora|mentor|mentora|entrevistador|entrevistadora|anfitri/i;

/** Legenda do apresentador pelo elenco: o primeiro cujo papel diz apresentador/mentor/entrevistador. */
function presenterFromCast(document: CourseDocument): PlatformContext['castPresenter'] {
  const m = document.cast.find((c) => PRESENTER_ROLE.test(c.role) && c.name.trim());
  if (!m) return undefined;
  const role = m.role.trim();
  // papel longo ("Mentora que conversa com o aluno") vira só a primeira palavra útil
  const short = role.length <= 32 ? role : role.split(/\s+(?:que|de|do|da|para)\s+/i)[0]!.slice(0, 32);
  return { name: m.name.trim(), role: short || undefined };
}
