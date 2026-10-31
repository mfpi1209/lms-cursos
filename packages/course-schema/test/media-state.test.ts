import { describe, expect, it } from 'vitest';
import { compileCourse, compileLesson } from '../src/compile';
import { PresentationSchema } from '../src/course';
import { comunicacaoPrimeiroEmprego } from '../src/examples';
import { mediaPresentationStale, presentationFingerprint, sceneCameraIds } from '../src/presentation-fingerprint';
import type { AnyNode, MediaRef } from '../src/nodes';
import { richTextFromPlain as p } from '../src/richtext';
import { linearGraph } from './helpers';

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);
const pres = (over: Record<string, unknown> = {}) => PresentationSchema.parse({ avatarId: 'av_1', voiceProvider: 'heygen', voiceId: 'vz_1', ...over });
const video = (extra: Partial<NonNullable<MediaRef['generatedFrom']>> = {}, stale?: boolean): MediaRef => ({
  assetId: 'ast_v',
  kind: 'video',
  ...(stale !== undefined ? { stale } : {}),
  generatedFrom: { jobId: 'job_1', sceneHash: 'h', provider: 'heygen', ...extra },
});

describe('presentationFingerprint', () => {
  it('é determinística e muda com apresentador, voz, fundo e posição', () => {
    const base = pres();
    expect(presentationFingerprint(base)).toBe(presentationFingerprint(pres()));
    expect(presentationFingerprint(pres({ avatarId: 'av_2' }))).not.toBe(presentationFingerprint(base));
    expect(presentationFingerprint(pres({ voiceId: 'vz_2' }))).not.toBe(presentationFingerprint(base));
    expect(presentationFingerprint(pres({ background: { type: 'color', value: '#000000' } }))).not.toBe(presentationFingerprint(base));
    expect(presentationFingerprint(pres({ presenterPlacement: 'right' }))).not.toBe(presentationFingerprint(base));
    expect(presentationFingerprint(base)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('posição livre, base, folga e cor só contam com a apresentadora montada por nós', () => {
    const center = pres();
    expect(presentationFingerprint(pres({ presenterX: 0.3 }))).toBe(presentationFingerprint(center));
    expect(presentationFingerprint(pres({ presenterGrade: 'warm' }))).toBe(presentationFingerprint(center));
    const right = pres({ presenterPlacement: 'right' });
    expect(presentationFingerprint(pres({ presenterPlacement: 'right', presenterX: 0.3 }))).not.toBe(presentationFingerprint(right));
    expect(presentationFingerprint(pres({ presenterPlacement: 'right', presenterBottom: 0.8 }))).not.toBe(presentationFingerprint(right));
    expect(presentationFingerprint(pres({ presenterPlacement: 'right', presenterGrade: 'warm' }))).not.toBe(presentationFingerprint(right));
  });

  it('balcão, enquadramento e desfoque do cenário só contam na montagem nossa', () => {
    const img = { type: 'image', assetId: 'ast_bg' };
    expect(presentationFingerprint(pres({ background: { ...img, foregroundFrom: 0.8 } }))).toBe(presentationFingerprint(pres({ background: img })));
    expect(presentationFingerprint(pres({ presenterPlacement: 'left', background: { ...img, foregroundFrom: 0.8 } }))).not.toBe(presentationFingerprint(pres({ presenterPlacement: 'left', background: img })));
    expect(presentationFingerprint(pres({ presenterPlacement: 'left', background: { ...img, blur: false } }))).not.toBe(presentationFingerprint(pres({ presenterPlacement: 'left', background: img })));
  });

  it('só as câmeras usadas pela cena entram: trocar uma câmera não usada não desatualiza', () => {
    const cams = [
      { id: 'cam_main', name: 'Principal', lookId: 'av_1' },
      { id: 'cam_b', name: 'B', lookId: 'look_b' },
    ];
    const a = pres({ cameras: cams });
    const b = pres({ cameras: [cams[0], { ...cams[1], lookId: 'look_b2' }] });
    expect(presentationFingerprint(a)).toBe(presentationFingerprint(b));
    expect(presentationFingerprint(a, { cameraIds: ['cam_b'] })).not.toBe(presentationFingerprint(b, { cameraIds: ['cam_b'] }));
    // a câmera principal (look do apresentador) entra sempre
    const c = pres({ cameras: [{ ...cams[0], nativeFraming: 'close' }, cams[1]] });
    expect(presentationFingerprint(c)).not.toBe(presentationFingerprint(a));
  });

  it('sceneCameraIds lê os planos da direção', () => {
    const node = { id: 'x', type: 'content', body: p('x'), objectiveIds: [], required: true, direction: { version: 1, shots: [{ id: 's1', line: 'a', cameraId: 'cam_b' }, { id: 's2', line: 'b' }] } } as unknown as AnyNode;
    expect(sceneCameraIds(node)).toEqual(['cam_b']);
    expect(sceneCameraIds(undefined)).toEqual([]);
  });

  it('mediaPresentationStale: desconhecida (sem impressão) nunca é desatualizada', () => {
    const current = pres();
    expect(mediaPresentationStale(video(), current)).toBe(false);
    expect(mediaPresentationStale(video({ presentationFingerprint: presentationFingerprint(current) }), current)).toBe(false);
    expect(mediaPresentationStale(video({ presentationFingerprint: presentationFingerprint(pres({ voiceId: 'vz_other' })) }), current)).toBe(true);
    expect(mediaPresentationStale(undefined, current)).toBe(false);
  });
});

describe('estado da mídia na compilação', () => {
  const withMedia = (media: MediaRef | undefined, opts: Parameters<typeof compileLesson>[1] = {}) => {
    const g = linearGraph();
    const intro = g.nodes.find((n) => n.id === 'intro')!;
    if (intro.type === 'content') intro.media = media;
    return compileLesson(g, opts);
  };

  it('MEDIA_STALE pelo texto continua como antes', () => {
    expect(codes(withMedia(video({}, true)).warnings)).toContain('MEDIA_STALE');
  });

  it('MEDIA_STALE quando a apresentação mudou (impressão diferente); nunca sem impressão', () => {
    const current = pres();
    const old = presentationFingerprint(pres({ avatarId: 'av_old' }));
    const r = withMedia(video({ presentationFingerprint: old }), { presentation: current });
    expect(codes(r.warnings)).toContain('MEDIA_STALE');
    expect(r.warnings.find((w) => w.code === 'MEDIA_STALE')?.message).toMatch(/apresentação/);
    expect(codes(withMedia(video({ presentationFingerprint: presentationFingerprint(current) }), { presentation: current }).warnings)).not.toContain('MEDIA_STALE');
    expect(codes(withMedia(video(), { presentation: current }).warnings)).not.toContain('MEDIA_STALE');
  });

  it('MEDIA_SIMULATED para vídeo simulado', () => {
    const r = withMedia(video({ simulated: true }));
    expect(codes(r.warnings)).toContain('MEDIA_SIMULATED');
    expect(codes(withMedia(video()).warnings)).not.toContain('MEDIA_SIMULATED');
  });

  it('MEDIA_MISSING só quando pedido (curso com apresentador)', () => {
    expect(codes(withMedia(undefined).warnings)).not.toContain('MEDIA_MISSING');
    const r = withMedia(undefined, { missingMedia: true });
    expect(r.warnings.filter((w) => w.code === 'MEDIA_MISSING').map((w) => w.nodeId).sort()).toEqual(['ca', 'cb', 'intro', 'q']);
  });

  it('MEDIA_IN_PROGRESS prevalece sobre os outros avisos de mídia da cena', () => {
    const r = withMedia(video({}, true), { openMediaNodeIds: new Set(['intro']), missingMedia: true });
    const intro = r.warnings.filter((w) => w.nodeId === 'intro').map((w) => w.code);
    expect(intro).toContain('MEDIA_IN_PROGRESS');
    expect(intro).not.toContain('MEDIA_STALE');
    expect(intro).not.toContain('MEDIA_MISSING');
  });

  it('compileCourse: sem apresentador não avisa MEDIA_MISSING; com apresentador avisa; jobs abertos viram MEDIA_IN_PROGRESS', () => {
    const doc = structuredClone(comunicacaoPrimeiroEmprego);
    expect(codes(compileCourse(doc).warnings)).not.toContain('MEDIA_MISSING');
    doc.presentation = pres();
    const r = compileCourse(doc);
    expect(codes(r.warnings)).toContain('MEDIA_MISSING');
    const l = doc.modules[0]!.lessons[0]!;
    const first = l.graph.nodes.find((n) => n.type === 'scenario' || n.type === 'content')!;
    const r2 = compileCourse(doc, { openMediaJobs: [{ lessonId: l.id, nodeId: first.id }] });
    expect(r2.warnings.find((w) => w.code === 'MEDIA_IN_PROGRESS')?.nodeId).toBe(first.id);
    expect(r2.warnings.some((w) => w.code === 'MEDIA_MISSING' && w.nodeId === first.id)).toBe(false);
  });
});

describe('OBJECTIVE_UNCOVERED conta só nós alcançáveis', () => {
  it('objetivo trabalhado apenas por um bloco fora do caminho continua descoberto', () => {
    const doc = structuredClone(comunicacaoPrimeiroEmprego);
    const l = doc.modules[0]!.lessons[0]!;
    doc.objectives.push({ id: 'obj_isolado', title: 'Objetivo isolado', required: true } as (typeof doc.objectives)[number]);
    // bloco fora do caminho (sem aresta de entrada) que referencia o objetivo
    l.graph.nodes.push({ id: 'orfao', type: 'content', body: p('x'), objectiveIds: ['obj_isolado'], required: true } as AnyNode);
    l.graph.edges.push({ id: 'orfao_fim', from: 'orfao', to: l.graph.nodes.find((n) => n.type === 'end')!.id });
    const r = compileCourse(doc);
    expect(codes(r.warnings)).toContain('UNREACHABLE');
    expect(r.warnings.find((w) => w.code === 'OBJECTIVE_UNCOVERED')?.message).toMatch(/Objetivo isolado/);
    // ligado ao caminho, passa a cobrir
    l.graph.edges.push({ id: 'liga', from: l.graph.startNodeId, to: 'orfao', condition: { op: 'eq', var: 'nunca', value: 1 } } as never);
    // (aresta com condição inválida só para ligar o nó; o que importa aqui é a alcançabilidade)
    const r2 = compileCourse(doc);
    expect(r2.warnings.some((w) => w.code === 'OBJECTIVE_UNCOVERED' && /Objetivo isolado/.test(w.message))).toBe(false);
  });
});
