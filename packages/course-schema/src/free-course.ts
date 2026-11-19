import type { CourseDocument } from './course';
import { courseWorkloadMinutes } from './length';

/*
 * Curso livre: curso longo (formato EaD, 4 a 8 h, com módulos e avaliações),
 * em oposição às pílulas (formato `micro`, minutos). A classificação sai do
 * documento publicado, sem coluna nova no banco.
 */

/** Carga declarada (minutos) a partir da qual um curso SEM formato gravado é tratado como EaD: o piso do perfil `ead` (4 h). */
export const FREE_COURSE_MIN_MINUTES = 240;

type FreeCourseDoc = { brief?: Partial<Pick<CourseDocument['brief'], 'format' | 'targetMinutes'>> | undefined; certificate?: CourseDocument['certificate'] };

/**
 * O curso é "livre" (EaD)?
 * 1. `brief.format` gravado decide: `ead` é livre, `micro` não é.
 * 2. Sem formato gravado (documentos publicados antes de o campo existir, ou importados sem ele), vale o perfil de
 *    duração DECLARADO: `certificate.workloadMinutes` ou `brief.targetMinutes` de 4 h ou mais.
 * A soma do `estimatedMinutes` das aulas não entra: é uma estimativa com valor padrão (15 min por aula) e classificaria
 * uma pílula de muitas aulas como curso livre.
 */
export function isFreeCourse(doc: FreeCourseDoc | null | undefined): boolean {
  if (!doc) return false;
  const format = doc.brief?.format;
  if (format) return format === 'ead';
  const declared = Math.max(doc.certificate?.workloadMinutes ?? 0, doc.brief?.targetMinutes ?? 0);
  return declared >= FREE_COURSE_MIN_MINUTES;
}

/** O certificado só é anunciado quando o documento o liga (`certificate.enabled`). */
export function hasCertificate(doc: Pick<CourseDocument, 'certificate'> | null | undefined): boolean {
  return doc?.certificate?.enabled === true;
}

/**
 * Carga horária do curso livre em minutos, pela ordem: a do certificado (`certificate.workloadMinutes`), a meta declarada
 * no briefing quando ela é de curso longo (4 h ou mais) e, por fim, a soma do `estimatedMinutes` das aulas.
 * Formate com `formatWorkload` (trail-credentials): "8 h", "7 h 30 min".
 */
export function freeCourseWorkloadMinutes(doc: Pick<CourseDocument, 'brief' | 'certificate' | 'modules'>): number {
  const declared = doc.certificate?.workloadMinutes;
  if (declared !== undefined) return declared;
  if (doc.brief.targetMinutes >= FREE_COURSE_MIN_MINUTES) return doc.brief.targetMinutes;
  return courseWorkloadMinutes(doc as CourseDocument);
}

/** A carga por extenso, para leitor de tela: "8 horas", "1 hora e 9 minutos", "45 minutos"; vazio sem carga. */
export function spokenWorkload(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  const rest = m % 60;
  const hours = h > 0 ? `${h} ${h === 1 ? 'hora' : 'horas'}` : '';
  const mins = rest > 0 ? `${rest} ${rest === 1 ? 'minuto' : 'minutos'}` : '';
  return hours && mins ? `${hours} e ${mins}` : hours || mins;
}

/** Posição (base 0) do módulo que contém a aula, contando só módulos com aulas; -1 se a aula não existe. */
export function moduleIndexOfLesson(doc: Pick<CourseDocument, 'modules'>, lessonId: string): number {
  return doc.modules.filter((m) => m.lessons.length > 0).findIndex((m) => m.lessons.some((l) => l.id === lessonId));
}
