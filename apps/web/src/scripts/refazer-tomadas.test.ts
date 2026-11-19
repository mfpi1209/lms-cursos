import { describe, expect, it } from 'vitest';
import type { CourseDocument } from '@lms/course-schema';
import { applyRetakes, findTake, parseArgs, parseTakeRef, takesOf } from './refazer-tomadas-calc';

const shot = (id: string, line: string, cameraId?: string, extra: Record<string, unknown> = {}) => ({ id, line, framing: 'medium', layout: 'presenter', cameraMove: 'static', transitionIn: 'cut', ...(cameraId ? { cameraId } : {}), ...extra });
const mkDoc = (voiceProvider = 'elevenlabs'): CourseDocument => ({
  presentation: { voiceProvider },
  modules: [],
  lessons: [{ id: 'aula_01', graph: { nodes: [{ id: 'v09', type: 'content', direction: { version: 1, shots: [shot('s1', 'um dois três quatro cinco seis', 'f'), shot('s2', 'sete oito nove dez', 'f'), shot('s3', 'onze doze treze quatorze quinze', 'l34'), shot('s4', 'a b c d e f g h', 'f')] } }, { id: 'v10', type: 'content' }], edges: [] } }],
}) as unknown as CourseDocument;

// allLessons percorre módulos; para o teste basta um documento mínimo compatível
const docWith = (d: CourseDocument): CourseDocument => ({ ...d, modules: [{ id: 'm1', title: 'M', lessons: (d as unknown as { lessons: unknown[] }).lessons }] }) as unknown as CourseDocument;

describe('refazer-tomadas: argumentos', () => {
  it('lê curso, tomadas (id do 1º plano ou índice), teto e modo; seco é o padrão', () => {
    const a = parseArgs(['--course', 'crs_1', '--tomadas', 'aula_01/v09#s3, aula_02/v05#1,aula_01/v09#s3', '--max-usd', '5']);
    expect(a).toEqual({ course: 'crs_1', tomadas: [{ lessonId: 'aula_01', nodeId: 'v09', ref: 's3' }, { lessonId: 'aula_02', nodeId: 'v05', ref: '1' }], maxUsd: 5, confirmar: false });
    expect(parseArgs(['--course', 'c', '--tomadas', 'a/b#c', '--max-usd', '1', '--confirmar']).confirmar).toBe(true);
    expect(parseTakeRef('aula_01/q01~a#s2')).toEqual({ lessonId: 'aula_01', nodeId: 'q01~a', ref: 's2' });
  });

  it('recusa entradas inválidas', () => {
    const ok = ['--course', 'c', '--tomadas', 'a/b#c', '--max-usd', '1'];
    expect(() => parseArgs(['--tomadas', 'a/b#c', '--max-usd', '1'])).toThrow(/course/);
    expect(() => parseArgs(['--course', 'c', '--max-usd', '1'])).toThrow(/tomadas/);
    expect(() => parseArgs(['--course', 'c', '--tomadas', 'a/b#c'])).toThrow(/max-usd/);
    expect(() => parseArgs(['--course', 'c', '--tomadas', 'v09#s3', '--max-usd', '1'])).toThrow(/inválida/);
    expect(() => parseArgs(['--course', 'c', '--tomadas', 'a/b', '--max-usd', '1'])).toThrow(/inválida/);
    expect(() => parseArgs([...ok, '--seco', '--confirmar'])).toThrow(/OU/);
    expect(() => parseArgs([...ok, '--x'])).toThrow(/desconhecido/);
  });
});

describe('refazer-tomadas: tomadas e variação no rascunho', () => {
  const d = docWith(mkDoc());
  const shots = (d as unknown as { modules: Array<{ lessons: Array<{ graph: { nodes: Array<{ direction?: { shots: never[] } }> } }> }> }).modules[0]!.lessons[0]!.graph.nodes[0]!.direction!.shots;

  it('lista as tomadas (índice, 1º plano, câmera, segundos)', () => {
    const t = takesOf(shots, true);
    expect(t.map((x) => [x.index, x.firstShotId, x.shotIds, x.cameraId])).toEqual([[1, 's1', ['s1', 's2'], 'f'], [2, 's3', ['s3'], 'l34'], [3, 's4', ['s4'], 'f']]);
    expect(t[0]!.seconds).toBeGreaterThan(t[1]!.seconds - 0.001);
    expect(findTake(t, 's2')?.firstShotId).toBe('s1');
    expect(findTake(t, '2')?.firstShotId).toBe('s3');
    expect(findTake(t, 'zz')).toBeUndefined();
  });

  it('incrementa a variação só da tomada marcada, num clone (o original não muda)', () => {
    const r = applyRetakes(d, [{ lessonId: 'aula_01', nodeId: 'v09', ref: 's3' }]);
    expect(r.applied.map((a) => [a.firstShotId, a.from, a.to])).toEqual([['s3', 0, 1]]);
    const dir = (x: CourseDocument) => (x as unknown as { modules: Array<{ lessons: Array<{ graph: { nodes: Array<{ direction?: { retake?: Record<string, number> } }> } }> }> }).modules[0]!.lessons[0]!.graph.nodes[0]!.direction!;
    expect(dir(r.doc).retake).toEqual({ s3: 1 });
    expect(dir(d).retake).toBeUndefined();
    expect(r.scenes).toEqual([{ lessonId: 'aula_01', nodeId: 'v09' }]);
    // de novo, sobre o rascunho já marcado: variação 2; id do meio da tomada vai para o 1º plano; índice e id da mesma tomada contam uma vez
    const r2 = applyRetakes(r.doc, [{ lessonId: 'aula_01', nodeId: 'v09', ref: 's3' }, { lessonId: 'aula_01', nodeId: 'v09', ref: 's2' }, { lessonId: 'aula_01', nodeId: 'v09', ref: '1' }]);
    expect(dir(r2.doc).retake).toEqual({ s3: 2, s1: 1 });
    expect(r2.applied).toHaveLength(2);
  });

  it('erra com mensagem clara quando aula, cena, direção ou tomada não existem', () => {
    expect(() => applyRetakes(d, [{ lessonId: 'x', nodeId: 'v09', ref: 's1' }])).toThrow(/aula "x"/);
    expect(() => applyRetakes(d, [{ lessonId: 'aula_01', nodeId: 'zz', ref: 's1' }])).toThrow(/cena/);
    expect(() => applyRetakes(d, [{ lessonId: 'aula_01', nodeId: 'v10', ref: 's1' }])).toThrow(/sem direção|não tem direção/);
    expect(() => applyRetakes(d, [{ lessonId: 'aula_01', nodeId: 'v09', ref: 's9' }])).toThrow(/tomadas: 1=s1, 2=s3, 3=s4/);
  });
});
