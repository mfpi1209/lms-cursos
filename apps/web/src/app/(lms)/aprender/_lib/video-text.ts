import { formatCourseVideo } from '@lms/course-schema';

/** Tempo de vídeo do curso, em segundos (mín–máx pelos ramos); `unavailable` = algum vídeo sem duração conhecida. */
export interface CourseVideo {
  minS: number;
  maxS: number;
  unavailable?: boolean;
}

/** Duração curta para o cartão ("4 min", "6–8 min"); null sem vídeo ou com duração indisponível. */
export function videoShort(v: CourseVideo): string | null {
  return v.unavailable ? null : formatCourseVideo(v);
}

/** O mesmo tempo, por extenso para leitor de tela: "4 minutos de vídeo", "de 6 a 8 minutos de vídeo". */
export function videoSpoken(v: CourseVideo): string | null {
  const t = videoShort(v);
  if (!t) return null;
  if (t.startsWith('Menos de 1')) return 'menos de 1 minuto de vídeo';
  const words = (part: string) =>
    part
      .replace(/(\d+) h\b/g, (_m, n: string) => `${n} ${n === '1' ? 'hora' : 'horas'}`)
      .replace(/(\d+) min\b/g, (_m, n: string) => `${n} ${n === '1' ? 'minuto' : 'minutos'}`)
      .replace(/ (\d+ (?:minuto|minutos))/, ' e $1');
  const parts = t.split('–');
  if (parts.length === 2) {
    // "6–8 min": a unidade vem só no fim; "50 min–1 h 5 min": cada ponta já tem a sua
    const lo = /min|h/.test(parts[0]!) ? words(parts[0]!) : parts[0]!;
    return `de ${lo} a ${words(parts[1]!)} de vídeo`;
  }
  return `${words(t)} de vídeo`;
}
