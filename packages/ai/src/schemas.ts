import { z } from 'zod';
import { applyCallsToGraph, applyDefaultReactions, DEFAULT_CALL, CAMERA_MOVES, CINEMATIC_ACTIONS, EXPERIENCE_FAMILIES, FRAMINGS, LAYOUTS, SceneDirectionSchema, TRANSITIONS, isHandSignGesture, richTextFromPlain, richTextToPlain, type LessonGraph, type AnyNode, type Edge, type SceneDirection, type Shot } from '@lms/course-schema';

/*
 * Formatos de proposta do agente. São deliberadamente mais simples que o
 * contrato executável (texto puro, destinos dentro das opções) e convertidos
 * no backend, que valida com o compilador antes de aplicar.
 * Todos os campos são obrigatórios (nulos quando não se aplicam) para
 * compatibilidade com saída estruturada estrita.
 */

const Slug = z.string().min(1).max(64).regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/).describe('identificador curto em snake_case, só letras sem acento, dígitos, _ e -');

export const OutlineProposalSchema = z.object({
  cast: z.array(
    z.object({
      name: z.string().max(60),
      role: z.string().max(120).describe('papel na história, ex.: recrutadora da Empresa X'),
      details: z.string().max(600).describe('ficha fixa: empresa, vaga, formação, formato/data da entrevista — usada em TODAS as aulas'),
    }),
  ).max(8).describe('elenco único do curso; o aluno não entra aqui (ele é "você")'),
  rationale: z.string().max(1200).describe('justificativa curta da sequência e das dinâmicas escolhidas, em pt-BR'),
  removedLessonIds: z.array(z.string().max(64)).max(50).describe('ids EXATOS das aulas de <estrutura_atual> que deixam de existir nesta proposta; lista vazia quando não há estrutura atual ou nada foi removido'),
  objectives: z.array(
    z.object({
      id: Slug,
      title: z.string().max(200).describe('habilidade observável, começando por verbo'),
      criterion: z.string().max(500).describe('como reconhecer que a pessoa aprendeu'),
      required: z.boolean(),
    }),
  ).min(1).max(12),
  modules: z.array(
    z.object({
      id: Slug,
      title: z.string().max(160),
      description: z.string().max(600),
      lessons: z.array(
        z.object({
          id: Slug,
          title: z.string().max(160),
          description: z.string().max(600).describe('o que acontece na aula, em uma ou duas frases'),
          family: z.enum(EXPERIENCE_FAMILIES),
          familyRationale: z.string().max(400).describe('por que essa dinâmica serve ao objetivo'),
          estimatedMinutes: z.number().int().min(2).max(60).describe('minutos da aula: 2 a 4 (cerca de 3)'),
          objectiveIds: z.array(Slug).min(1).max(4),
          keyScenes: z.array(z.string().max(200)).min(2).max(8).describe('as 3 a 5 cenas principais, em ordem (situação, decisão, consequências, dica)'),
        }),
      ).min(1).max(12),
    }),
  ).min(1).max(8),
});
export type OutlineProposal = z.infer<typeof OutlineProposalSchema>;

export const SceneTypeSchema = z.enum(['scenario', 'content', 'choice', 'consequence', 'reflection', 'assessment', 'end']);

/** Uma cena do roteiro (elemento de LessonScript.scenes). */
export const LessonSceneSchema = z.object({
  id: Slug,
  type: SceneTypeSchema,
  title: z.string().max(120),
  text: z.string().max(4000).describe('texto da cena exibido na tela, em pt-BR; parágrafos separados por linha em branco; sem markdown'),
  narration: z.string().max(2500).describe('o que o apresentador FALA nesta cena no vídeo: direto com o aluno, frases curtas, fácil de dizer em voz alta; "" em reflection, assessment e end'),
  motionPrompt: z.string().max(300).describe('direção de gesto do apresentador em inglês para o motor de vídeo: UM gesto + uma emoção, ex. "nods slowly, warm"; nada de dedos, sinais com a mão ou acenos; "" quando não houver vídeo'),
  objectiveIds: z.array(Slug).max(4),
  next: Slug.nullable().describe('id da próxima cena para tipos lineares; null para end e choice'),
  options: z.array(
    z.object({
      id: Slug,
      label: z.string().max(300),
      feedback: z.string().max(600).describe('retorno curto para quem escolhe esta opção'),
      next: Slug.nullable().describe('cena de destino (choice); null em assessment'),
      correct: z.boolean().describe('apenas assessment; false em choice'),
    }),
  ).nullable(),
  tone: z.enum(['positive', 'neutral', 'negative']).nullable(),
  guidance: z.string().max(800).nullable().describe('consequence: o que levar disso'),
  assessment: z
    .object({
      mode: z.enum(['single', 'multiple']),
      passing: z.enum(['all_correct', 'min_correct']),
      minCorrect: z.number().int().min(1).nullable(),
      maxAttempts: z.number().int().min(1).max(5),
      feedbackPassed: z.string().max(600),
      feedbackFailed: z.string().max(600),
    })
    .nullable(),
  reflection: z.object({ minLength: z.number().int().min(0).max(1000), maxLength: z.number().int().min(50).max(3000), placeholder: z.string().max(200) }).nullable(),
});
export type LessonScene = z.infer<typeof LessonSceneSchema>;

export const LessonScriptSchema = z.object({
  rationale: z.string().max(1200).describe('justificativa curta: como as cenas servem aos objetivos; o que é fato fundamentado vs. exemplo fictício'),
  scenes: z.array(LessonSceneSchema).min(3).max(40),
});
export type LessonScript = z.infer<typeof LessonScriptSchema>;

/** Focos de revisão oferecidos como comandos na interface (seção 8 da especificação). */
export const REVISION_FOCUS = ['difficulty_easier', 'difficulty_harder', 'more_plausible_options', 'expand_consequences', 'vary_dynamic', 'shorten', 'practical', 'teaching', 'tone'] as const;
export const RevisionFocusSchema = z.enum(REVISION_FOCUS);
export type RevisionFocus = z.infer<typeof RevisionFocusSchema>;
export const REVISION_FOCUS_LABELS: Record<RevisionFocus, string> = {
  difficulty_easier: 'Deixar mais fácil',
  difficulty_harder: 'Deixar mais desafiadora',
  more_plausible_options: 'Criar alternativas plausíveis',
  expand_consequences: 'Expandir consequências',
  vary_dynamic: 'Variar experiência',
  shorten: 'Encurtar',
  practical: 'Mais prático: dicas e orientação direta',
  teaching: 'Voz de ensino: mentor falando com você',
  tone: 'Ajustar tom',
};

/** Focos de revisão que exigem os limites de extensão da escrita de aulas (≤ 7 cenas, 3 opções, cena "Dica"…). */
export const CAPPED_REVISION_FOCUS: ReadonlyArray<RevisionFocus> = ['shorten', 'practical'];

/** Focos de revisão que exigem as regras de voz de ensino (segunda pessoa, consequências como feedback, cena que ensina). */
export const VOICE_REVISION_FOCUS: ReadonlyArray<RevisionFocus> = ['teaching', 'shorten', 'practical'];

/** Tipos de cena que aceitam variações pontuais. */
export const VARIATION_SCENE_TYPES = ['choice', 'consequence'] as const;
export type VariationSceneType = (typeof VARIATION_SCENE_TYPES)[number];

/** Alternativas para UMA cena (mesmo id e tipo); o autor escolhe uma depois. */
export const SceneVariationsSchema = z.object({
  rationale: z.string().max(800).describe('em uma ou duas frases, o que diferencia as variações'),
  variations: z.array(
    z.object({
      label: z.string().min(1).max(120).describe('rótulo curto que distingue a variação, em pt-BR'),
      scene: LessonSceneSchema,
    }),
  ).min(2).max(3),
});
export type SceneVariations = z.infer<typeof SceneVariationsSchema>;

function spoken(s: { narration?: string; motionPrompt?: string }) {
  const out: { narration?: string; motionPrompt?: string } = {};
  if (s.narration && s.narration.trim()) out.narration = s.narration.trim();
  // gestos com dedos/sinais/acenos saem errados no avatar: descartados (o diretor escolhe outro)
  const mp = s.motionPrompt?.trim();
  if (mp && !isHandSignGesture(mp)) out.motionPrompt = mp.slice(0, 200);
  return out;
}

/**
 * Converte o roteiro proposto no grafo executável (arestas como fonte de verdade).
 * `calls` (padrão): cada decisão ganha a chamada padrão e o vídeo anfitrião termina
 * com ela (bridge.ts); a revisão de uma aula existente desliga e decide por decisão.
 */
export function scriptToGraph(script: LessonScript, opts: { calls?: boolean } = {}): LessonGraph {
  const calls = opts.calls !== false;
  const nodes: AnyNode[] = [];
  const edges: Edge[] = [];
  const ids = new Set(script.scenes.map((s) => s.id));
  let edgeN = 0;
  const edge = (from: string, to: string, optionId?: string): Edge => ({ id: `e${++edgeN}_${from}`.slice(0, 64), from, to, ...(optionId ? { optionId } : {}) });
  for (const s of script.scenes) {
    const base = { id: s.id, title: s.title, objectiveIds: s.objectiveIds.filter(Boolean), required: true };
    switch (s.type) {
      case 'scenario':
      case 'content':
        nodes.push({ ...base, type: s.type, body: richTextFromPlain(s.text), ...spoken(s) });
        if (s.next && ids.has(s.next)) edges.push(edge(s.id, s.next));
        break;
      case 'consequence':
        nodes.push({ ...base, type: 'consequence', body: richTextFromPlain(s.text), tone: s.tone ?? 'neutral', guidance: s.guidance ? richTextFromPlain(s.guidance) : undefined, ...spoken(s) });
        if (s.next && ids.has(s.next)) edges.push(edge(s.id, s.next));
        break;
      case 'choice': {
        const options = (s.options ?? []).slice(0, 6).map((o) => ({ id: o.id, label: o.label, feedback: o.feedback ? richTextFromPlain(o.feedback) : undefined }));
        // ponte: a instrutora chama o aluno no fim do vídeo (da própria decisão ou da cena anterior); aplicada no fim
        nodes.push({ ...base, type: 'choice', prompt: richTextFromPlain(s.text), ...spoken(s), ...(calls ? { bridge: { call: DEFAULT_CALL } } : {}), options: options.length >= 2 ? options : [...options, ...Array.from({ length: 2 - options.length }, (_, i) => ({ id: `opcao_${i + 1}`, label: 'Opção' }))] });
        for (const o of s.options ?? []) if (o.next && ids.has(o.next)) edges.push(edge(s.id, o.next, o.id));
        break;
      }
      case 'reflection':
        nodes.push({ ...base, type: 'reflection', prompt: richTextFromPlain(s.text), minLength: s.reflection?.minLength ?? 40, maxLength: s.reflection?.maxLength ?? 1500, placeholder: s.reflection?.placeholder });
        if (s.next && ids.has(s.next)) edges.push(edge(s.id, s.next));
        break;
      case 'assessment': {
        const a = s.assessment;
        const options = (s.options ?? []).slice(0, 8).map((o) => ({ id: o.id, label: o.label, correct: o.correct, feedback: o.feedback ? richTextFromPlain(o.feedback) : undefined }));
        nodes.push({
          ...base,
          type: 'assessment',
          prompt: richTextFromPlain(s.text),
          mode: a?.mode ?? 'single',
          options: options.length >= 2 ? options : [...options, { id: 'opcao_x', label: 'Opção', correct: false }],
          passing: a?.passing === 'min_correct' && a.minCorrect ? { kind: 'min_correct', min: a.minCorrect } : { kind: 'all_correct' },
          maxAttempts: a?.maxAttempts ?? 2,
          feedbackPassed: a?.feedbackPassed ? richTextFromPlain(a.feedbackPassed) : undefined,
          feedbackFailed: a?.feedbackFailed ? richTextFromPlain(a.feedbackFailed) : undefined,
        });
        if (s.next && ids.has(s.next)) edges.push(edge(s.id, s.next));
        break;
      }
      case 'end':
        nodes.push({ ...base, type: 'end', summary: richTextFromPlain(s.text), outcomeLabel: 'Aula concluída' });
        break;
    }
  }
  // padrão do motor: chamada no fim do vídeo antes da pergunta (bridge.ts) e reação da instrutora a cada resposta (reaction.ts)
  const finalNodes = calls ? applyDefaultReactions(applyCallsToGraph({ nodes, edges }).graph).graph.nodes : nodes;
  return { schemaVersion: 1, startNodeId: script.scenes[0]!.id, variables: [], nodes: finalNodes, edges, layout: { positions: {} } };
}

const emptyScene = (id: string, type: LessonScene['type'], title: string, objectiveIds: string[]): LessonScene => ({
  id, type, title: title.slice(0, 120), text: '', narration: '', motionPrompt: '', objectiveIds: objectiveIds.slice(0, 4), next: null, options: null, tone: null, guidance: null, assessment: null, reflection: null,
});

/**
 * Converte o grafo executável de volta ao formato de roteiro (inverso de
 * `scriptToGraph`), para que o agente revise uma aula existente. Texto rico
 * vira texto puro; destinos vêm das arestas. O que o roteiro não representa
 * (arestas condicionais, efeitos, variáveis, mídia, blocos não executáveis) é
 * descartado e relatado em `warnings`; `applyScriptToGraph` repõe parte disso.
 */
export function graphToScriptWithWarnings(graph: LessonGraph): { script: LessonScript; warnings: string[] } {
  const warnings: string[] = [];
  const ids = new Set(graph.nodes.map((n) => n.id));
  const out = new Map<string, Edge[]>();
  for (const e of graph.edges) {
    if (!ids.has(e.to)) continue;
    const list = out.get(e.from) ?? [];
    list.push(e);
    out.set(e.from, list);
  }
  /** destino único de um grupo de arestas: a padrão, senão a primeira sem condição */
  const pick = (edges: Edge[], where: string): string | null => {
    if (edges.length === 0) return null;
    const chosen = edges.find((e) => e.isDefault) ?? edges.find((e) => !e.condition) ?? edges[0]!;
    const dropped = edges.filter((e) => e !== chosen);
    if (dropped.length) warnings.push(`${where}: ${dropped.length} saída(s) condicional(is) descartada(s); o roteiro mantém só o destino padrão "${chosen.to}"`);
    if (chosen.condition && !chosen.isDefault) warnings.push(`${where}: a condição da saída para "${chosen.to}" foi descartada`);
    if (chosen.effects?.length) warnings.push(`${where}: efeitos da aresta para "${chosen.to}" foram descartados`);
    return chosen.to;
  };
  const ordered = [...graph.nodes].sort((a, b) => (a.id === graph.startNodeId ? -1 : b.id === graph.startNodeId ? 1 : 0));
  if (graph.variables.length) warnings.push(`variáveis (${graph.variables.map((v) => v.name).join(', ')}) não aparecem no roteiro`);
  const scenes: LessonScene[] = [];
  for (const n of ordered) {
    const where = `cena "${n.title ?? n.id}"`;
    const edges = out.get(n.id) ?? [];
    const base = { ...emptyScene(n.id, 'content', n.title ?? n.id, n.objectiveIds), narration: 'narration' in n && typeof n.narration === 'string' ? n.narration : '', motionPrompt: 'motionPrompt' in n && typeof n.motionPrompt === 'string' ? n.motionPrompt : '' };
    if ('media' in n && n.media) warnings.push(`${where}: a mídia não é editada pelo agente e será preservada`);
    if (n.type === 'reflection' && n.scaffold) warnings.push(`${where}: a frase para montar (blocos) não é editada pelo agente e será preservada`);
    switch (n.type) {
      case 'scenario':
      case 'content':
        scenes.push({ ...base, type: n.type, text: richTextToPlain(n.body), next: pick(edges, where) });
        break;
      case 'consequence':
        if (n.effects?.length) warnings.push(`${where}: efeitos sobre variáveis serão preservados tal como estão`);
        scenes.push({ ...base, type: 'consequence', text: richTextToPlain(n.body), tone: n.tone, guidance: n.guidance ? richTextToPlain(n.guidance) : null, next: pick(edges, where) });
        break;
      case 'choice':
        scenes.push({
          ...base, type: 'choice', text: richTextToPlain(n.prompt),
          options: n.options.map((o) => ({ id: o.id, label: o.label, feedback: richTextToPlain(o.feedback), next: pick(edges.filter((e) => e.optionId === o.id), `${where}, opção "${o.label}"`), correct: false })),
        });
        break;
      case 'reflection':
        scenes.push({ ...base, type: 'reflection', text: richTextToPlain(n.prompt), next: pick(edges, where), reflection: { minLength: Math.min(n.minLength, 1000), maxLength: Math.max(50, Math.min(n.maxLength, 3000)), placeholder: n.placeholder ?? '' } });
        break;
      case 'assessment':
        scenes.push({
          ...base, type: 'assessment', text: richTextToPlain(n.prompt), next: pick(edges, where),
          options: n.options.map((o) => ({ id: o.id, label: o.label, feedback: richTextToPlain(o.feedback), next: null, correct: o.correct })),
          assessment: {
            mode: n.mode,
            passing: n.passing.kind,
            minCorrect: n.passing.kind === 'min_correct' ? n.passing.min : null,
            maxAttempts: Math.min(n.maxAttempts, 5),
            feedbackPassed: richTextToPlain(n.feedbackPassed),
            feedbackFailed: richTextToPlain(n.feedbackFailed),
          },
        });
        break;
      case 'end':
        scenes.push({ ...base, type: 'end', text: richTextToPlain(n.summary) });
        break;
      default:
        warnings.push(`${where}: bloco "${n.type}" ainda não é executável e foi omitido do roteiro`);
    }
  }
  return { script: { rationale: '', scenes }, warnings };
}

export function graphToScript(graph: LessonGraph): LessonScript {
  return graphToScriptWithWarnings(graph).script;
}

/**
 * Converte um roteiro em grafo preservando, do grafo original, o que o roteiro
 * não carrega: variáveis, posições de layout, mídia e efeitos de nós com o
 * mesmo id. Usado ao aplicar revisões para que o diff fique restrito ao texto.
 */
const sameSpoken = (a: string, b: string) => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

/** Texto falado de um nó: a fala ou, sem fala, o texto da tela. */
function spokenTextOf(n: AnyNode): string {
  const narration = 'narration' in n && typeof n.narration === 'string' ? n.narration.trim() : '';
  if (narration) return narration;
  if (n.type === 'scenario' || n.type === 'content' || n.type === 'consequence') return richTextToPlain(n.body).trim();
  if (n.type === 'choice') return richTextToPlain(n.prompt).trim();
  return '';
}

export function applyScriptToGraph(original: LessonGraph, script: LessonScript): LessonGraph {
  const next = scriptToGraph(script, { calls: false });
  const prev = new Map(original.nodes.map((n) => [n.id, n]));
  const mediaTypes: ReadonlyArray<AnyNode['type']> = ['scenario', 'content', 'choice', 'consequence'];
  const mapped = next.nodes.map((n): AnyNode => {
    const p = prev.get(n.id);
    // decisão nova na revisão: chamada padrão; decisão existente sem chamada continua sem (a revisão não muda a fala sozinha)
    if (!p || p.type !== n.type) return n.type === 'choice' && !p ? ({ ...n, bridge: { call: DEFAULT_CALL } } as AnyNode) : n;
    const spokenBefore = spokenTextOf(p);
    const spokenNow = spokenTextOf(n);
    const spokenChanged = !sameSpoken(spokenBefore, spokenNow);
    // a mídia continua ligada ao nó, mas fica desatualizada se a fala (ou o texto lido) mudou
    const prevMedia = 'media' in p && p.media && mediaTypes.includes(n.type) ? p.media : undefined;
    const media = prevMedia ? { media: spokenChanged ? { ...prevMedia, stale: true } : prevMedia } : {};
    const effects = p.type === 'consequence' && n.type === 'consequence' && p.effects?.length ? { effects: p.effects } : {};
    // a direção só sobrevive se a fala não mudou (o áudio é cortado pelas linhas dos planos)
    const prevDirection = 'direction' in p ? p.direction : undefined;
    const keep = prevDirection && spokenNow && mediaTypes.includes(n.type) && sameSpoken(prevDirection.shots.map((s) => s.line).join(' '), spokenNow);
    const direction = keep ? { direction: prevDirection } : {};
    // campos que o roteiro da IA ainda não carrega (ver docs): composição guiada, revisão e qualidade das opções
    const scaffold = p.type === 'reflection' && n.type === 'reflection' && p.scaffold ? { scaffold: p.scaffold } : {};
    const review = p.type === 'content' && n.type === 'content' && p.reviewNodeIds?.length ? { reviewNodeIds: p.reviewNodeIds } : {};
    const qualityOf = (id: string) => (p.type === 'choice' ? p.options.find((x) => x.id === id)?.quality : undefined);
    // a reação (texto e vídeo) da opção existente continua; opção nova recebe a padrão abaixo
    const reactionOf = (id: string) => (p.type === 'choice' ? p.options.find((x) => x.id === id)?.reaction : undefined);
    const options = n.type === 'choice' ? { options: n.options.map((o) => ({ ...o, ...(qualityOf(o.id) ? { quality: qualityOf(o.id) } : {}), ...(reactionOf(o.id) ? { reaction: reactionOf(o.id) } : {}) })) } : {};
    // chamada escrita no estúdio/roteiro vale mais que a padrão do agente
    const bridge = p.type === 'choice' && n.type === 'choice' && p.bridge?.call ? { bridge: p.bridge } : {};
    return { ...n, ...media, ...effects, ...direction, ...scaffold, ...review, ...options, ...bridge } as AnyNode;
  });
  // chamada no fim do vídeo anfitrião (idempotente: a fala que já termina com ela não muda)
  const withCalls = applyCallsToGraph({ nodes: mapped, edges: next.edges }).graph;
  // reação padrão só onde a aula antiga já tinha reações ou a decisão é nova (a revisão não cria custo sozinha)
  const hadReactions = original.nodes.some((n) => n.type === 'choice' && n.options.some((o) => o.reaction?.text));
  const nodes = withCalls.nodes.map((n) => (n.type === 'choice' && (hadReactions || !prev.has(n.id)) ? applyDefaultReactions({ nodes: [n] }).graph.nodes[0]! : n));
  const positions: Record<string, { x: number; y: number }> = {};
  for (const n of nodes) {
    const pos = original.layout.positions[n.id];
    if (pos) positions[n.id] = pos;
  }
  return { ...next, variables: original.variables, nodes, layout: { positions } };
}

/** Substitui uma cena do roteiro pela variação escolhida (mesmo id). */
export function swapScene(script: LessonScript, scene: LessonScene): LessonScript {
  return { ...script, scenes: script.scenes.map((s) => (s.id === scene.id ? scene : s)) };
}

/*
 * Direção cinematográfica proposta pela IA diretora. Mesmo princípio dos demais
 * formatos: todas as chaves obrigatórias (nulas quando não se aplicam) para
 * saída estruturada estrita. Limites que o modelo costuma errar (quantidade de
 * planos e de tópicos) ficam frouxos aqui e são verificados por
 * `validateDirectionScene`, que pede reparo em vez de falhar o parse.
 */
export const SLIDE_STYLES = ['clean', 'bold', 'quote', 'checklist'] as const;

export const DirectionSlideProposalSchema = z.object({
  title: z.string().max(160).describe('título curto do slide, em pt-BR (até 80 caracteres; no cartão, até 8 palavras)'),
  bullets: z.array(z.string().max(200)).max(8).describe('2–3 tópicos de até 12 palavras, com as palavras-chave entre ** (ex.: "Chegue **dez minutos antes**"); nada de frases inteiras copiadas da fala'),
  highlight: z.string().max(240).nullable().describe('frase-chave ou pergunta em destaque (até 120 caracteres); null se não houver'),
  style: z.enum(SLIDE_STYLES),
  variant: z.enum(['light', 'navy']).nullable().describe('cartão (layout card): fundo claro ou marinho; alterne entre cartões da aula; null nos demais layouts (inclusive presenter_panel e presenter_chips)'),
});

export const DirectionShotProposalSchema = z.object({
  id: z.string().min(1).max(40).describe('id curto e único na cena, ex.: s1, s2'),
  line: z.string().min(1).max(1200).describe('trecho EXATO da fala coberto por este plano; todos os trechos em ordem reproduzem a fala inteira'),
  cameraId: z.string().max(40).nullable().describe('id de uma câmera de <cameras>; null quando não houver câmeras cadastradas'),
  framing: z.enum(FRAMINGS),
  layout: z.enum(LAYOUTS),
  cameraMove: z.enum(CAMERA_MOVES),
  motionPrompt: z.string().max(300).describe('em inglês: UM gesto + uma emoção coerentes com a linha (até 200 caracteres); diferente do plano anterior; "" se nenhum'),
  slide: DirectionSlideProposalSchema.nullable().describe('obrigatório nos layouts com slide; null nos demais'),
  caption: z.string().max(200).nullable().describe('texto do letreiro, até 80 caracteres (lower_third; opcional em cinematic); null nos demais'),
  transitionIn: z.enum(TRANSITIONS),
  cinematic: z
    .object({
      action: z.enum(CINEMATIC_ACTIONS).describe('movimento da apresentadora: walk_toward_camera | walk_across | walk_away | walk_in_and_sit | walk_and_look_around'),
      prompt: z.string().max(600).describe('em INGLÊS: só o LUGAR (ambiente, luz, os objetos que a ação usa, hora do dia); a ação e a câmera vêm de action'),
      setting: z.string().max(300).nullable().describe('rótulo curto em pt-BR do que acontece na cena; null se não houver'),
    })
    .nullable()
    .describe('obrigatório no layout cinematic; null nos demais'),
});
export type DirectionShotProposal = z.infer<typeof DirectionShotProposalSchema>;

export const DirectionSceneProposalSchema = z.object({
  nodeId: z.string().min(1).max(64).describe('id da cena em <cenas>'),
  intent: z.string().max(600).describe('nota do diretor: intenção da cena em uma frase (até 300 caracteres), em pt-BR'),
  shots: z.array(DirectionShotProposalSchema).min(1).max(20),
});
export type DirectionSceneProposal = z.infer<typeof DirectionSceneProposalSchema>;

export const SceneDirectionProposalSchema = z.object({
  scenes: z.array(DirectionSceneProposalSchema).min(1).max(40),
});
export type SceneDirectionProposal = z.infer<typeof SceneDirectionProposalSchema>;

/** Layouts que exibem um slide (exigem `slide`). */
export const SLIDE_LAYOUTS: ReadonlyArray<Shot['layout']> = ['presenter_slide_right', 'presenter_slide_left', 'slide_with_pip', 'slide', 'card', 'presenter_panel', 'presenter_chips'];

/**
 * Converte a cena proposta no contrato `SceneDirection` (nulos e vazios
 * descartados, `source: 'ai'`). Lança se o resultado não validar.
 */
export function directionProposalToSceneDirection(p: DirectionSceneProposal): SceneDirection {
  const shots = p.shots.map((s) => {
    const shot: Record<string, unknown> = { id: s.id.trim(), line: s.line.trim(), framing: s.framing, layout: s.layout, cameraMove: s.cameraMove, transitionIn: s.transitionIn };
    if (s.cameraId && s.cameraId.trim()) shot.cameraId = s.cameraId.trim();
    // cena em movimento não tem gesto (o apresentador não fala)
    if (s.motionPrompt.trim() && s.layout !== 'cinematic') shot.motionPrompt = s.motionPrompt.trim().slice(0, 200);
    if (s.caption && s.caption.trim()) shot.caption = s.caption.trim().slice(0, 80);
    if (s.layout === 'cinematic' && s.cinematic?.prompt.trim()) {
      shot.cinematic = { action: s.cinematic.action, prompt: s.cinematic.prompt.trim(), ...(s.cinematic.setting?.trim() ? { setting: s.cinematic.setting.trim().slice(0, 200) } : {}) };
    }
    if (s.slide) {
      const slide: Record<string, unknown> = { title: s.slide.title.trim(), bullets: s.slide.bullets.map((b) => b.trim()).filter(Boolean), style: s.slide.style };
      if (s.slide.highlight && s.slide.highlight.trim()) slide.highlight = s.slide.highlight.trim();
      if (s.layout === 'card' && s.slide.variant) slide.variant = s.slide.variant;
      shot.slide = slide;
    }
    return shot;
  });
  return SceneDirectionSchema.parse({ version: 1, shots, intent: p.intent.trim().slice(0, 300), source: 'ai' });
}
