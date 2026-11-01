import { inArray } from 'drizzle-orm';
import { getDb, schema } from '@lms/db';
import { courseVideoRange, lessonVideoAssetIds, lessonVideoRange, type RuntimeLesson, type VideoRange } from '@lms/course-schema';

/**
 * Duração de VÍDEO dos cursos (tempo real de conteúdo), calculada a partir da VERSÃO PUBLICADA da matrícula e da
 * duração gravada em cada asset (o vídeo cortado pelo ajuste fino é outro asset, com a duração dele). Ramos viram
 * faixa mín–máx (o aluno vê só a reação que escolheu). Leitura, respostas e atividades NÃO entram: variam por aluno.
 *
 * Cache por versão: versões publicadas e assets não mudam depois de criados, então o resultado de uma versão vale
 * até a próxima publicação (que tem outro id). Mídia sem duração não vira zero: volta em `missing` e a tela mostra
 * "duração indisponível" (as pendências ficam no log do servidor; `duracoes-faltantes.ts` no worker preenche).
 */
export type LessonRuntime = VideoRange;
export interface VersionRuntime {
  course: VideoRange;
  lessons: Map<string, VideoRange>;
}

const cache = new Map<string, VersionRuntime>();
const MAX_CACHE = 500;

async function durationsOf(ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const rows = await getDb()
    .select({ id: schema.assets.id, d: schema.assets.durationSeconds })
    .from(schema.assets)
    .where(inArray(schema.assets.id, ids));
  return new Map(rows.filter((r) => r.d != null && Number(r.d) >= 0).map((r) => [r.id, Number(r.d)]));
}

/** Duração de vídeo de várias versões publicadas de uma vez (uma consulta só para os assets que faltam no cache). */
export async function versionsRuntime(versions: Array<{ id: string; lessons: Array<RuntimeLesson & { id: string }> }>): Promise<Map<string, VersionRuntime>> {
  const out = new Map<string, VersionRuntime>();
  const todo = versions.filter((v) => {
    const hit = cache.get(v.id);
    if (hit) out.set(v.id, hit);
    return !hit;
  });
  if (todo.length) {
    const durations = await durationsOf([...new Set(todo.flatMap((v) => v.lessons.flatMap((l) => lessonVideoAssetIds(l))))]);
    for (const v of todo) {
      const lessons = new Map(v.lessons.map((l) => [l.id, lessonVideoRange(l, durations)] as const));
      const course = courseVideoRange(v.lessons, durations);
      const rt = { course, lessons };
      if (course.missing.length) {
        console.warn(`[duração] versão ${v.id}: ${course.missing.length} vídeo(s) sem duração (${course.missing.slice(0, 5).join(', ')}): duração indisponível até preencher`);
      } else {
        if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
        cache.set(v.id, rt); // só guarda resultado completo (pendente é recalculado na próxima visita)
      }
      out.set(v.id, rt);
    }
  }
  return out;
}

export async function versionRuntime(versionId: string, lessons: Array<RuntimeLesson & { id: string }>): Promise<VersionRuntime> {
  return (await versionsRuntime([{ id: versionId, lessons }])).get(versionId)!;
}
