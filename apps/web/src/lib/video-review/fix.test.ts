import { describe, expect, it } from 'vitest';
import { buildBrief, isVagueMark, renderGroupBrief, rulesFor, type BriefInput } from './brief';
import { classifyFix, maxUsdFor, type FixInput } from './fix';
import { resolveMark, speechWindow, type SceneReviewContext } from './resolve';
import { shouldMarkReady, transition, TransitionError } from './status';

const cue = (start: number, end: number, text: string) => ({ start, end, text });
const CUES = [cue(0, 5, 'Oi! Que bom ter você aqui hoje.'), cue(5, 10, 'Em oito horas você monta seu assistente.'), cue(10, 15, 'Agora eu confiro cada um na busca.'), cue(15, 20, 'O terceiro não existe de jeito nenhum.')];
const shots = [
  { id: 's1', line: 'Oi! Que bom ter você aqui hoje.', cameraId: 'cam_esq', framing: 'medium' as const, layout: 'presenter' as const },
  { id: 's2', line: 'Em oito horas você monta seu assistente.', cameraId: 'cam_esq', framing: 'medium' as const, layout: 'presenter' as const },
  { id: 's3', line: 'Agora eu confiro cada um na busca.', cameraId: 'cam_dir', framing: 'medium' as const, layout: 'presenter' as const },
  { id: 's4', line: 'O terceiro não existe de jeito nenhum.', cameraId: 'cam_dir', framing: 'medium' as const, layout: 'presenter' as const },
];
function scene(over: Partial<SceneReviewContext> = {}): SceneReviewContext {
  return { lessonId: 'aula_01', lessonTitle: 'A1', nodeId: 'v01', title: 'Boas-vindas', assetId: 'ast_1', sceneHash: 'h', captionsAssetId: null, durationSec: 20, cues: CUES, captionsApprox: false, hasNarrationAudio: true, shots, dropped: [], retake: {}, cameras: [{ id: 'cam_esq', zone: 'left' }, { id: 'cam_dir', zone: 'right' }], topics: [{ text: 'Oito horas de curso', cue: 'Em oito horas' }, { text: 'Busca confere', cue: 'eu confiro' }], teaser: false, screens: null, ...over };
}
const screenScene = scene({ nodeId: 'v07', shots: null, topics: null, screens: [{ fileName: 'gravacao_busca.mp4', durationSec: 20, source: 'mock', mock: { model: 'browser', device: 'phone', app: 'Buscador', steps: [{ kind: 'type', text: 'Tempo de Sobra', cue: 'eu confiro' }, { kind: 'show', title: 'Nenhum resultado', lines: [], cue: 'não existe' }] } }] });

const fi = (over: Partial<FixInput>): FixInput => ({ courseId: 'crs_1', lessonId: 'aula_01', nodeId: 'v01', category: 'gesture', resolution: resolveMark(scene(), 3), scene: { changed: false, usd: 1.2 }, retakeUsd: 0.9, telasFile: 'docs/roteiros/telas/c1.telas.md', topicosFile: 'docs/roteiros/telas/c1.topicos.md', simulation: true, ...over });

describe('estados da marca', () => {
  it('Corrigir leva cada tipo ao estado certo', () => {
    expect(transition('open', { type: 'request_fix', kind: 'paid' })).toBe('awaiting_approval');
    expect(transition('open', { type: 'request_fix', kind: 'edit' })).toBe('awaiting_fix');
    expect(transition('open', { type: 'request_fix', kind: 'manual' })).toBe('awaiting_fix');
    expect(transition('open', { type: 'request_fix', kind: 'free', enqueued: true })).toBe('reprocessing');
    expect(transition('open', { type: 'request_fix', kind: 'free', enqueued: false })).toBe('awaiting_fix');
  });
  it('aprovação, execução, vídeo novo, conferência', () => {
    expect(transition('awaiting_approval', { type: 'approve' })).toBe('awaiting_fix');
    expect(transition('awaiting_fix', { type: 'executed' })).toBe('reprocessing');
    expect(transition('reprocessing', { type: 'asset_changed' })).toBe('ready_to_check');
    expect(transition('ready_to_check', { type: 'resolve' })).toBe('resolved');
    expect(transition('ready_to_check', { type: 'still_wrong' })).toBe('open');
    expect(transition('resolved', { type: 'reopen' })).toBe('open');
  });
  it('recusa transições sem sentido', () => {
    expect(() => transition('open', { type: 'approve' })).toThrow(TransitionError);
    expect(() => transition('awaiting_approval', { type: 'executed' })).toThrow(TransitionError);
    expect(() => transition('awaiting_fix', { type: 'request_fix', kind: 'edit' })).toThrow(TransitionError);
    expect(() => transition('open', { type: 'still_wrong' })).toThrow(TransitionError);
    expect(() => transition('resolved', { type: 'resolve' })).toThrow(TransitionError);
  });
  it('pronta para conferir só quando o vídeo da cena mudou desde o pedido', () => {
    expect(shouldMarkReady('reprocessing', 'ast_1', 'ast_2')).toBe(true);
    expect(shouldMarkReady('awaiting_fix', 'ast_1', 'ast_2')).toBe(true);
    expect(shouldMarkReady('reprocessing', 'ast_1', 'ast_1')).toBe(false);
    expect(shouldMarkReady('open', 'ast_1', 'ast_2')).toBe(false);
  });
});

describe('classificação do conserto', () => {
  it('gesto numa tomada de apresentador: pago, com a tomada e os comandos a seco e --confirmar', () => {
    const p = classifyFix(fi({}));
    expect(p).toMatchObject({ kind: 'paid', target: 'retake', usd: 0.9, tomadas: ['aula_01/v01#s1'], autoRun: false, executor: 'operator' });
    expect(p.commands.dryRun).toBe('cd apps/web && tsx src/scripts/refazer-tomadas.ts --course crs_1 --tomadas aula_01/v01#s1 --max-usd 2');
    expect(p.commands.dryRun).not.toContain('--confirmar');
    expect(p.commands.confirm).toContain('--confirmar');
  });
  it('rascunho já mudou e remontar custa US$ 0: grátis; enfileira só em modo real', () => {
    const demo = classifyFix(fi({ category: 'screen', resolution: resolveMark(screenScene, 16), nodeId: 'v07', scene: { changed: true, usd: 0 } }));
    expect(demo).toMatchObject({ kind: 'free', target: 'remount', usd: 0, autoRun: false, executor: 'operator' });
    const real = classifyFix(fi({ category: 'screen', resolution: resolveMark(screenScene, 16), nodeId: 'v07', scene: { changed: true, usd: 0 }, simulation: false }));
    expect(real).toMatchObject({ kind: 'free', autoRun: true, executor: 'studio' });
  });
  it('rascunho mudou mas custa: pago (regravar a cena)', () => {
    expect(classifyFix(fi({ category: 'topics', scene: { changed: true, usd: 0.4 } }))).toMatchObject({ kind: 'paid', target: 'scene', usd: 0.4 });
  });
  it('tela/sincronia em tela simulada e tópicos: edição com os comandos de aplicar', () => {
    const scr = classifyFix(fi({ category: 'sync', resolution: resolveMark(screenScene, 16), nodeId: 'v07' }));
    expect(scr).toMatchObject({ kind: 'edit', target: 'screen' });
    expect(scr.commands.apply![0]).toBe('./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/aplicar-telas.ts --course crs_1 --file docs/roteiros/telas/c1.telas.md --seco');
    expect(classifyFix(fi({ category: 'topics', resolution: resolveMark(scene(), 7) }))).toMatchObject({ kind: 'edit', target: 'topics' });
  });
  it('fala, corte, outro e cena sem direção', () => {
    expect(classifyFix(fi({ category: 'speech' }))).toMatchObject({ kind: 'edit', target: 'speech' });
    expect(classifyFix(fi({ category: 'cut' }))).toMatchObject({ kind: 'manual', target: 'cut' });
    expect(classifyFix(fi({ category: 'other' }))).toMatchObject({ kind: 'manual', target: 'other' });
    expect(classifyFix(fi({ resolution: resolveMark(scene({ shots: null }), 3) }))).toMatchObject({ kind: 'manual' });
    expect(classifyFix(fi({ resolution: null }))).toMatchObject({ kind: 'manual' });
  });
  it('teto do --max-usd com folga', () => {
    expect(maxUsdFor(0)).toBe(1);
    expect(maxUsdFor(1.37)).toBe(2);
  });
});

describe('prompt de correção', () => {
  const base = (over: Partial<BriefInput> = {}): BriefInput => {
    const res = resolveMark(screenScene, 16.8);
    return {
      course: { id: 'crs_1', title: 'IA na prática' },
      mark: { id: 'vrm_1', lessonId: 'aula_02', nodeId: 'v07', sceneTimeSec: 16.8, category: 'sync', note: 'o resultado aparece antes da fala', expected: 'aparecer quando ele diz "não existe"' },
      resolution: res,
      stale: false,
      speech: speechWindow(CUES, 16.8, 3),
      spec: { kind: 'screen', file: 'docs/roteiros/telas/c1.telas.md', line: 3, itemLine: 8, section: 'gravacao_busca', current: ['## gravacao_busca', 'Modelo: navegador', '- digita: Tempo de Sobra (na fala: "eu confiro")', '- mostra: Nenhum resultado (na fala: "não existe")'], matchesDraft: true },
      topics: null,
      plan: classifyFix(fi({ category: 'sync', resolution: res, nodeId: 'v07', lessonId: 'aula_02' })),
      studioUrl: '/estudio/cursos/crs_1/assistir?aula=aula_02',
      ...over,
    };
  };
  it('tem as 8 seções, na ordem, com o alvo exato', () => {
    const b = buildBrief(base());
    const titles = [...b.replace(/```[\s\S]*?```/g, "").matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(titles).toEqual(['Corrigir', 'Problema', 'Esperado', 'Onde', 'Fala naquele trecho', 'Estado atual', 'Regras', 'Como conferir']);
    expect(b).toContain('IA na prática (crs_1) · aula_02/v07');
    expect(b).toContain('docs/roteiros/telas/c1.telas.md:8 — seção `gravacao_busca`');
    expect(b).toContain('passo 2/2');
    expect(b).toMatch(/0:13\.8–0:19\.8: ".*não existe.*"/);
    expect(b).toContain('- mostra: Nenhum resultado (na fala: "não existe")');
    expect(b).toContain('trecho LITERAL da fala');
    expect(b).toContain('qa-telas.ts --course crs_1 --cenas v07');
    expect(b).toContain('aplicar-telas.ts --course crs_1 --file docs/roteiros/telas/c1.telas.md --seco');
  });
  it('sem "deveria ficar": nota vaga explícita', () => {
    const m = { ...base().mark, expected: null };
    expect(isVagueMark(m)).toBe(true);
    expect(isVagueMark(base().mark)).toBe(false);
    expect(buildBrief(base({ mark: m }))).toMatch(/## Esperado\n\(não informado — nota vaga/);
  });
  it('tomada: regras de custo com o valor aprovado e painel de pulsos para conferir', () => {
    const res = resolveMark(scene(), 3);
    const i = base({ mark: { ...base().mark, nodeId: 'v01', lessonId: 'aula_01', category: 'gesture', sceneTimeSec: 3 }, resolution: res, spec: null, plan: classifyFix(fi({})) });
    expect(rulesFor(i).join(' ')).toContain('US$ 0.90');
    const b = buildBrief(i);
    expect(b).toContain('tomada `aula_01/v01#s1`');
    expect(b).toContain('painel-pulsos.ts --course crs_1 --cenas v01');
  });
  it('grupo: regras uma vez só e uma seção por marca', () => {
    const g = renderGroupBrief('Correções de tela simulada — c1.telas.md', [base(), base({ mark: { ...base().mark, id: 'vrm_2', sceneTimeSec: 12 } })], ['cabeçalho']);
    expect(g.match(/## Regras/g)).toHaveLength(1);
    expect(g).toContain('### 1. aula_02/v07 0:16.8');
    expect(g).toContain('### 2. aula_02/v07 0:12.0');
    expect(g).toContain('(2 marcas)');
  });
});
