import { describe, expect, it } from 'vitest';
import { buildActionPlan, courseStem, groupBriefs, findScreenSection, findTopicSection, parseArgs, sectionLines, type PlannedMark } from './revisao-acoes-calc';
import { resolveMark, type SceneReviewContext } from '@/lib/video-review/resolve';

const TELAS = `# Telas

## gravacao_busca
Modelo: navegador
Aparelho: celular
App: Buscador
- digita: Tempo de Sobra (na fala: "eu confiro")
- mostra: Nenhum resultado (na fala: "não existe")
`;
const TOPICOS = `# Tópicos

## V01
- Oito horas de curso (na fala: "Em oito horas")
- Celular na mão (na fala: "Pega o celular")
`;

const cue = (start: number, end: number, text: string) => ({ start, end, text });
const CUES = [cue(0, 5, 'Oi! Que bom ter você aqui hoje.'), cue(5, 10, 'Em oito horas você monta seu assistente.'), cue(10, 15, 'Agora eu confiro cada um na busca.'), cue(15, 20, 'O terceiro não existe, Pega o celular.')];

function scene(over: Partial<SceneReviewContext>): SceneReviewContext {
  return { lessonId: 'aula_01', lessonTitle: 'A1', nodeId: 'v01', title: 'Boas-vindas', assetId: 'ast_1', sceneHash: null, captionsAssetId: null, durationSec: 20, cues: CUES, captionsApprox: false, hasNarrationAudio: true, shots: null, dropped: [], retake: {}, cameras: [], topics: null, teaser: false, screens: null, ...over };
}
const mark = (id: string, sc: SceneReviewContext, t: number, category: PlannedMark['category'], note = ''): PlannedMark => ({ id, lessonId: sc.lessonId, nodeId: sc.nodeId, sceneTimeSec: t, category, note, expected: null, resolution: resolveMark(sc, t), stale: false, scene: sc });

describe('args', () => {
  it('exige --course e aceita --aula/--json', () => {
    expect(parseArgs(['--course', 'crs_1', '--aula', 'aula_02', '--json'])).toEqual({ course: 'crs_1', aula: 'aula_02', json: true, prompts: false, pendentes: false, executada: [] });
    expect(parseArgs(['--course', 'c', '--executada', 'vrm_a,vrm_b']).executada).toEqual(['vrm_a', 'vrm_b']);
    expect(() => parseArgs(['--course', 'c', '--prompts', '--pendentes'])).toThrow(/só um/);
    expect(() => parseArgs([])).toThrow(/--course/);
    expect(() => parseArgs(['--course', 'x', '--foo'])).toThrow(/desconhecido/);
  });
});

describe('arquivos de roteiro', () => {
  it('linha do cabeçalho e do item da seção', () => {
    expect(sectionLines(TELAS, 'gravacao_busca', 2)).toEqual({ heading: 3, item: 8 });
    expect(sectionLines(TELAS, 'nao_existe')).toBeUndefined();
  });
  it('acha a seção da tela e diz se é igual ao rascunho', () => {
    const hit = findScreenSection([{ path: 'docs/roteiros/telas/c1.telas.md', text: TELAS }], 'gravacao_busca.mp4', 'v07', undefined, 1);
    expect(hit).toMatchObject({ file: 'docs/roteiros/telas/c1.telas.md', section: 'gravacao_busca', line: 3, itemLine: 7, matchesDraft: false });
  });
  it('acha a seção de tópicos e o tópico', () => {
    const hit = findTopicSection([{ path: 'docs/roteiros/telas/c1.topicos.md', text: TOPICOS }], 'v01', [{ text: 'Oito horas de curso', cue: 'Em oito horas' }, { text: 'Celular na mão', cue: 'Pega o celular' }], 2);
    expect(hit).toMatchObject({ section: 'V01', line: 3, itemLine: 5, matchesDraft: true });
    expect(courseStem({ telas: [], topicos: [{ path: 'docs/roteiros/telas/c1-x.topicos.md', text: TOPICOS }] }, [{ nodeId: 'v01', topics: [{ text: 'Oito horas de curso', cue: 'Em oito horas' }, { text: 'Celular na mão', cue: 'Pega o celular' }], screens: null }])).toBe('c1-x');
  });
});

describe('plano de ações', () => {
  const shots = [
    { id: 's1', line: 'Oi! Que bom ter você aqui hoje.', cameraId: 'cam_esq', framing: 'medium' as const, layout: 'presenter' as const },
    { id: 's2', line: 'Em oito horas você monta seu assistente.', cameraId: 'cam_esq', framing: 'medium' as const, layout: 'presenter' as const },
    { id: 's3', line: 'Agora eu confiro cada um na busca.', cameraId: 'cam_dir', framing: 'medium' as const, layout: 'presenter' as const },
    { id: 's4', line: 'O terceiro não existe, Pega o celular.', cameraId: 'cam_dir', framing: 'medium' as const, layout: 'presenter' as const },
  ];
  const directed = scene({ shots, topics: [{ text: 'Oito horas de curso', cue: 'Em oito horas' }, { text: 'Celular na mão', cue: 'Pega o celular' }] });
  const screenScene = scene({ nodeId: 'v07', screens: [{ fileName: 'gravacao_busca.mp4', durationSec: 20, source: 'mock', mock: { model: 'browser', device: 'phone', app: 'Buscador', steps: [{ kind: 'type', text: 'Tempo de Sobra', cue: 'eu confiro' }, { kind: 'show', title: 'Nenhum resultado', lines: [], cue: 'não existe' }] } }] });
  const specs = { telas: [{ path: 'docs/roteiros/telas/c1.telas.md', text: TELAS }], topicos: [{ path: 'docs/roteiros/telas/c1.topicos.md', text: TOPICOS }], roteiros: [{ path: 'docs/roteiros/c1.md', text: '# C1\n\n### V01 — Boas-vindas\n\nfala\n' }], stem: 'c1' };

  it('agrupa marcas da mesma tomada numa só e monta a lista --tomadas', () => {
    const plan = buildActionPlan('crs_1', [mark('m1', directed, 2, 'gesture', 'mão alta'), mark('m2', directed, 7, 'wrist', 'pulseira'), mark('m3', directed, 12, 'face')], specs);
    expect(plan.retakes.tomadas).toEqual(['aula_01/v01#s1', 'aula_01/v01#s3']);
    expect(plan.retakes.items[0]!.markIds).toEqual(['m1', 'm2']);
  });

  it('sincronia numa tela simulada vira edição do .telas.md com o "na fala" sugerido', () => {
    const plan = buildActionPlan('crs_1', [mark('m4', screenScene, 17.5, 'sync', 'entra antes da fala')], specs);
    expect(plan.screens).toHaveLength(1);
    expect(plan.screens[0]!.file).toBe('docs/roteiros/telas/c1.telas.md:8');
    expect(plan.screens[0]!.what).toMatch(/passo 2\/2/);
    expect(plan.screens[0]!.suggestion).toMatch(/\(na fala: "[^"]+"\) no lugar de \(na fala: "não existe"\)/);
  });

  it('painel, fala, corte e outros', () => {
    const plan = buildActionPlan('crs_1', [mark('m5', directed, 6.5, 'topics', 'tópico errado'), mark('m6', directed, 3, 'speech'), mark('m7', directed, 10.1, 'cut'), mark('m8', directed, 4, 'other', '??')], specs);
    expect(plan.topics[0]!.file).toBe('docs/roteiros/telas/c1.topicos.md:4');
    expect(plan.speech[0]!.file).toBe('docs/roteiros/c1.md:3');
    expect(plan.cuts[0]!.what).toMatch(/corte s2→s3 \(troca de câmera\)/);
    expect(plan.others[0]!.what).toMatch(/^Outro: tomada aula_01\/v01#s1/);
  });
});

describe('agrupamento dos prompts', () => {
  it('telas por arquivo, tomadas numa lista, na ordem dos grupos', () => {
    const mk = (id: string, target: string, file?: string) => ({ mark: { id }, plan: { target }, spec: file ? { file } : null }) as never;
    const g = groupBriefs([mk('a', 'other'), mk('b', 'retake'), mk('c', 'screen', 'x.telas.md'), mk('d', 'screen', 'x.telas.md'), mk('e', 'topics', 'x.topicos.md')]);
    expect(g.map((x) => x.key)).toEqual(['screen:x.telas.md', 'retake', 'topics:x.topicos.md', 'other']);
    expect(g[0]!.items).toHaveLength(2);
  });
});
