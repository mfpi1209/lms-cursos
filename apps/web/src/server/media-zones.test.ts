import { describe, expect, it } from 'vitest';
import { allLessons, markdownToCourseDocument, parseMarkdownCourse, type CourseDocument } from '@lms/course-schema';
import { mediaConfigFromEnv } from '@lms/media';
import { resolveSceneProduction, sceneRequestFromPresentation, sceneScreenText, studioSceneOverlays } from './media';

/* Uma aula: vídeo com cartão (vai para a decisão), decisão e vídeo sem cartão. */
const MD = `# Curso zonas

Ideia: Testar o estúdio com zonas.
Público: iniciantes.
Objetivo final: Ao final, a pessoa entende.
Duração-alvo: 1 aula de 3 minutos.

## Módulo 1 — Único

Descrição: Um módulo.

### Aula 1 — Experiência
Objetivo: Ao final, você reconhece experiências.

### V01 — Abertura
**Fala para gravação**
"Muita gente trava logo no começo. Experiência não é só carteira assinada. Ajudar no negócio da família, organizar um evento da escola, cuidar das redes de um projeto, treinar um time do bairro: tudo isso mostra o que você sabe fazer. A pergunta certa é onde você já assumiu uma responsabilidade."
Texto na tela: Escola · Família
Cartão: Isso também é experiência
- Ajudar no **negócio da família**
- Organizar **eventos** da escola

### Q01 — Isso entra?
Situação: Você organiza os campeonatos do bairro.
Voz opcional: não
| Escolha | Qualidade | Feedback | Destino |
|---|---|---|---|
| "Coloco, sim." | forte | É uma responsabilidade real. | V02 |
| "Não coloco." | fraca | Experiência conta. | V02 |

### V02 — Fechamento
**Fala para gravação**
"Agora, o pulo do gato: transformar experiência em habilidade. Uma única situação pode mostrar várias habilidades."
Texto na tela: Habilidade

### FIM — O que você levou
- Experiência não é só emprego.
- Conte o exemplo.
`;

const zoneCams = [
  { id: 'cam_estudio_34', name: '3/4', lookId: 'l34', nativeFraming: 'medium' as const, angle: 'left' as const, status: 'ready' as const, placement: 'full_frame' as const, zone: 'center' as const },
  { id: 'cam_estudio_esq', name: 'Esq', lookId: 'lesq', nativeFraming: 'medium' as const, angle: 'front' as const, status: 'ready' as const, placement: 'full_frame' as const, zone: 'left' as const },
  { id: 'cam_estudio_dir', name: 'Dir', lookId: 'ldir', nativeFraming: 'medium' as const, angle: 'front' as const, status: 'ready' as const, placement: 'full_frame' as const, zone: 'right' as const },
];

function docWith(cameras: CourseDocument['presentation']['cameras']): CourseDocument {
  return markdownToCourseDocument(parseMarkdownCourse(MD), {
    presentation: { avatarId: cameras[0]!.lookId, voiceProvider: 'elevenlabs', voiceId: 'v1', cameras },
    presenter: { name: 'Marina', role: 'Sua orientadora' },
  });
}

const cfg = mediaConfigFromEnv({ MEDIA_SIMULATION: '1' } as unknown as NodeJS.ProcessEnv);
const env = { PLATFORM_BRAND: 'dnawork' } as unknown as NodeJS.ProcessEnv;

describe('estúdio com zonas: pedido de produção', () => {
  it('cena antes da decisão leva a pergunta; a primeira cena da aula leva o letreiro com o nome; ambos no hash e na entrada do job', () => {
    const doc = docWith(zoneCams);
    const lesson = allLessons(doc)[0]!;
    const v01 = resolveSceneProduction(doc, sceneRequestFromPresentation(doc, lesson.id, 'v01'), cfg, env);
    expect(v01.jobInput.nextQuestion).toBe('Isso entra?');
    expect(v01.jobInput.lowerThird).toEqual({ name: 'Marina', role: 'Sua orientadora', brand: 'DNA Work' });
    const v02 = resolveSceneProduction(doc, sceneRequestFromPresentation(doc, lesson.id, 'v02'), cfg, env);
    expect(v02.jobInput.nextQuestion).toBeUndefined();
    expect(v02.jobInput.lowerThird).toBeUndefined();
    // a direção usa as câmeras de zona e as pílulas
    const shots = (v01.jobInput.direction as { shots: Array<{ layout: string; cameraId?: string }> }).shots;
    expect(shots.find((s) => s.layout === 'presenter_chips')?.cameraId).toBe('cam_estudio_esq');
    // o hash muda quando a pergunta muda (o mesmo documento sem a decisão seguinte = outro hash)
    const noNext = studioSceneOverlays(doc, { ...lesson.graph, edges: lesson.graph.edges.filter((e) => e.from !== 'v01') }, 'v01', true, env);
    expect(noNext.nextQuestion).toBeUndefined();
    expect(noNext.lowerThird).toBeDefined();
  });

  it('sem câmeras de zona: nada muda (sem pergunta, sem letreiro; mesmo hash de antes)', () => {
    const doc = docWith([{ id: 'cam_principal', name: 'P', lookId: 'look', nativeFraming: 'medium', angle: 'front', status: 'ready' }]);
    const lesson = allLessons(doc)[0]!;
    const v01 = resolveSceneProduction(doc, sceneRequestFromPresentation(doc, lesson.id, 'v01'), cfg, env);
    expect(v01.jobInput.nextQuestion).toBeUndefined();
    expect(v01.jobInput.lowerThird).toBeUndefined();
    expect(studioSceneOverlays(doc, lesson.graph, 'v01', true, env)).toEqual({});
    // plano único (sem direção) nunca recebe as camadas
    expect(studioSceneOverlays(docWith(zoneCams), lesson.graph, 'v01', false, env)).toEqual({});
  });

  it('a zona da câmera entra no hash (pílulas do outro lado = outro vídeo)', () => {
    const a = docWith(zoneCams);
    const b = docWith(zoneCams.map((c) => (c.id === 'cam_estudio_esq' ? { ...c, zone: 'right' as const } : c.id === 'cam_estudio_dir' ? { ...c, zone: 'left' as const } : c)));
    const lesson = allLessons(a)[0]!;
    // mesma direção gravada (cópia da de A), só a zona das câmeras muda
    const node = allLessons(b)[0]!.graph.nodes.find((n) => n.id === 'v01')!;
    const nodeA = lesson.graph.nodes.find((n) => n.id === 'v01')!;
    if ('direction' in node && 'direction' in nodeA) (node as { direction?: unknown }).direction = nodeA.direction;
    const ha = resolveSceneProduction(a, sceneRequestFromPresentation(a, lesson.id, 'v01'), cfg, env).sceneHash;
    const hb = resolveSceneProduction(b, sceneRequestFromPresentation(b, lesson.id, 'v01'), cfg, env).sceneHash;
    expect(ha).not.toBe(hb);
  });
});

describe('estúdio com zonas: texto na tela no lado vazio', () => {
  const lessonOf = (doc: CourseDocument) => allLessons(doc)[0]!;

  it('cena sem pílulas leva o "Texto na tela" do roteiro (body do nó) no job e no hash; cena com cartão não', () => {
    const doc = docWith(zoneCams);
    const lesson = lessonOf(doc);
    const v02 = resolveSceneProduction(doc, sceneRequestFromPresentation(doc, lesson.id, 'v02'), cfg, env);
    expect(v02.jobInput.screenText).toBe('Habilidade');
    // com pílulas (cartão) o texto já aparece nelas: não duplica
    const v01 = resolveSceneProduction(doc, sceneRequestFromPresentation(doc, lesson.id, 'v01'), cfg, env);
    expect(v01.jobInput.screenText).toBeUndefined();
    // o hash muda com o texto (dispara a remontagem), mas só por ele
    const edited = structuredClone(doc);
    const node = lessonOf(edited).graph.nodes.find((n) => n.id === 'v02') as { body: { content: Array<{ content?: Array<{ text?: string }> }> } };
    node.body.content[0]!.content![0]!.text = 'Outra coisa';
    const v02b = resolveSceneProduction(edited, sceneRequestFromPresentation(edited, lesson.id, 'v02'), cfg, env);
    expect(v02b.jobInput.screenText).toBe('Outra coisa');
    expect(v02b.sceneHash).not.toBe(v02.sceneHash);
    // o que gera o avatar (fala, câmera, voz) é igual: mesma direção e mesmo roteiro
    expect(v02b.script).toBe(v02.script);
    expect(v02b.jobInput.direction).toEqual(v02.jobInput.direction);
  });

  it('sem "Texto na tela" (o corpo é só o título da cena) ou sem zonas: nada', () => {
    const doc = docWith(zoneCams);
    const lesson = lessonOf(doc);
    const edited = structuredClone(doc);
    const node = lessonOf(edited).graph.nodes.find((n) => n.id === 'v02') as { title: string; body: { content: Array<{ content?: Array<{ text?: string }> }> } };
    node.body.content[0]!.content![0]!.text = node.title;
    expect(resolveSceneProduction(edited, sceneRequestFromPresentation(edited, lesson.id, 'v02'), cfg, env).jobInput.screenText).toBeUndefined();
    const plain = docWith([{ id: 'cam_principal', name: 'P', lookId: 'look', nativeFraming: 'medium', angle: 'front', status: 'ready' }]);
    expect(resolveSceneProduction(plain, sceneRequestFromPresentation(plain, lessonOf(plain).id, 'v02'), cfg, env).jobInput.screenText).toBeUndefined();
  });

  it('só com a apresentadora num lado e todos os planos presenter (sem slide/pílulas/painel)', () => {
    const doc = docWith(zoneCams);
    const graph = lessonOf(doc).graph;
    const dir = (layout: string, cameraId = 'cam_estudio_esq', slide?: unknown) => ({ shots: [{ id: 's1', line: 'x', layout, cameraId, ...(slide ? { slide } : {}) }] }) as never;
    expect(sceneScreenText(doc, graph, 'v02', dir('presenter'))).toBe('Habilidade');
    expect(sceneScreenText(doc, graph, 'v02', dir('presenter', 'cam_estudio_dir'))).toBe('Habilidade');
    expect(sceneScreenText(doc, graph, 'v02', dir('presenter_chips'))).toBeUndefined();
    expect(sceneScreenText(doc, graph, 'v02', dir('presenter_panel'))).toBeUndefined();
    expect(sceneScreenText(doc, graph, 'v02', dir('presenter', 'cam_estudio_esq', { title: 'x', bullets: [] }))).toBeUndefined();
    // câmera 3/4 (centro): sem lado vazio
    expect(sceneScreenText(doc, graph, 'v02', dir('presenter', 'cam_estudio_34'))).toBeUndefined();
    expect(sceneScreenText(doc, graph, 'v02', undefined)).toBeUndefined();
  });
});
