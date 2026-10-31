import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compileCourse } from '../src/compile';
import { courseLengthReport } from '../src/length';
import { allLessons } from '../src/course';
import { richTextToPlain } from '../src/richtext';
import { sameWords, spokenWords } from '../src/direction';
import { buildCardDirection, importMarkdownCourse, markdownToCourseDocument, MarkdownCourseError, parseMarkdownCourse, parseTargetDuration, splitSentences } from '../src/import/markdown-course';
import type { AnyNode } from '../src/nodes';
import { CALL_SHOT_ID } from '../src/bridge';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const REAL_SCRIPT = path.join(ROOT, 'docs/roteiros/curso-primeira-vaga.md');

/* Roteiro mínimo: duas aulas com todos os tipos de cena (vídeo com e sem cartão, decisão com e sem voz, composição, anotação, avaliação e FIM com checklist). */
const FIXTURE = `# Curso de teste

Ideia: Um curso curtinho para treinar o formato do roteiro.
Público: jovens no primeiro emprego; tímidos.
Objetivo final: Ao final, a pessoa reconhece o formato e monta uma frase.
Duração-alvo: 2 aulas de 3 a 5 minutos (cerca de 0h10 no total).
Personagens de exemplo (fictícios): Júlia, 21, estuda em Belém. Caio, 18, estuda em Recife.

## Módulo 1 — Primeiro módulo

Descrição: Um módulo com duas aulas.

### Aula 1 — Primeira aula
Objetivo: Ao final, você reconhece o formato.

### V01 — Abertura
**Fala para gravação**
"Muita gente trava logo no começo: 'como vou conseguir?'. Calma. Experiência não é só carteira assinada. Ajudar no negócio da família, organizar um evento da escola, cuidar das redes de um projeto, treinar um time do bairro: tudo isso mostra o que você sabe fazer. A pergunta certa é: onde eu já assumi uma responsabilidade? Nesta aula, você vai encontrar essas experiências na sua própria história."
Texto na tela: Escola · Família · Bairro
Cartão: Isso também é experiência
- Ajudar no **negócio da família**
- Organizar **eventos** da escola
- **Voluntariado** e cursos

### Q01 — Isso entra?
Situação: Você organiza os campeonatos do bairro.
Voz opcional: não
Chamada: "Agora é com você: o campeonato do bairro entra no currículo?"
| Escolha | Qualidade | Feedback | Destino |
|---|---|---|---|
| "Coloco, sim." | forte | É uma responsabilidade real. | V02 |
| "Não coloco." | fraca | Experiência não depende de salário. | V02 |
| "Só se for de esportes." | ok | Serve para qualquer vaga. | A01 |

### V02 — Sem cartão
**Fala para gravação**
"Agora, o pulo do gato: transformar experiência em habilidade. Percebe? Uma única situação pode mostrar várias habilidades."
Texto na tela: O que eu fazia?

### A01 — Anotação opcional
Pergunta: Em que situação alguém pôde contar com você?
Pular: sim
Destino: M01

### M01 — Missão: sua frase
Montar frase: "Eu já {experiencia}. Isso mostra que sei {habilidade}."
- {experiencia}: ajudei na família · organizei um evento
- {habilidade}: me comunicar · me organizar · trabalhar em equipe
Destino: FIM

### FIM — O que você levou
- Experiência não é só emprego.
- Conte o exemplo.
Meu roteiro: minha frase (frase montada em M01); minha anotação (A01), se preenchida

### Aula 2 — Segunda aula
Objetivo: Ao final, você passa na revisão.

### V03 — Revisão
**Fala para gravação**
"Chegou a hora de revisar. Responda com calma: são duas perguntas e você tem duas tentativas em cada uma."
Texto na tela: Revisão

### Q02 — Com voz
Situação: Entrevista para Jovem Aprendiz.
Voz opcional: sim
| Escolha | Qualidade | Feedback | Destino |
|---|---|---|---|
| "Nasci em Recife." | fraca | Detalhes pessoais não mostram o que você faz. | AV01 |
| "Termino o médio este ano." | forte | Hoje, orgulho e o que busca. | AV01 |

### AV01 — Revisão do módulo
Tentativas: 2
Aprovação: 1 de 2
1. Qual situação entra no currículo?
   - Organizar um evento da escola (correta)
   - Só carteira assinada
   Explicação: Atividades da escola contam.
2. Diferencial quer dizer o quê?
   - Obrigatório
   - Ajuda, mas não elimina (correta)
   - Só para quem sabe
   Explicação: Diferencial é desejável.
Destino: FIM

### FIM — O que você levou
- Revise com calma.
- Duas tentativas bastam.
Checklist: Minha busca: cadastro feito · três pessoas avisadas
Meu roteiro: checklist "Minha busca"

## Notas para a montagem

- Esta seção não é conteúdo.
`;

const nodesOf = (doc: ReturnType<typeof markdownToCourseDocument>) => allLessons(doc).flatMap((l) => l.graph.nodes);
const byType = <T extends AnyNode['type']>(nodes: AnyNode[], t: T) => nodes.filter((n): n is Extract<AnyNode, { type: T }> => n.type === t);

describe('parseMarkdownCourse (fixture)', () => {
  const parsed = parseMarkdownCourse(FIXTURE);

  it('lê cabeçalho, módulos, aulas e todos os tipos de cena; ignora as "Notas"', () => {
    expect(parsed.title).toBe('Curso de teste');
    expect(parsed.header.idea).toMatch(/^Um curso curtinho/);
    expect(parsed.header.audience).toMatch(/tímidos/);
    expect(parsed.header.characters).toMatch(/^Júlia, 21/);
    expect(parsed.modules).toHaveLength(1);
    expect(parsed.modules[0]).toMatchObject({ number: 1, title: 'Primeiro módulo', description: 'Um módulo com duas aulas.' });
    const [a1, a2] = parsed.modules[0]!.lessons;
    expect(a1).toMatchObject({ number: 1, title: 'Primeira aula', objective: 'Ao final, você reconhece o formato.' });
    expect(a1!.scenes.map((s) => s.kind)).toEqual(['video', 'decision', 'video', 'note', 'scaffold', 'end']);
    expect(a2!.scenes.map((s) => s.kind)).toEqual(['video', 'decision', 'assessment', 'end']);
  });

  it('vídeo: fala sem aspas, texto na tela e cartão com negrito; decisão: situação, voz e tabela com qualidade e destino', () => {
    const v01 = parsed.modules[0]!.lessons[0]!.scenes[0];
    expect(v01?.kind).toBe('video');
    if (v01?.kind !== 'video') return;
    expect(v01.narration.startsWith('Muita gente trava')).toBe(true);
    expect(v01.narration.endsWith('própria história.')).toBe(true);
    expect(v01.narration).not.toMatch(/^"|"$/);
    expect(v01.screenText).toBe('Escola · Família · Bairro');
    expect(v01.card).toEqual({ title: 'Isso também é experiência', bullets: ['Ajudar no **negócio da família**', 'Organizar **eventos** da escola', '**Voluntariado** e cursos'] });
    const v02 = parsed.modules[0]!.lessons[0]!.scenes[2];
    expect(v02?.kind === 'video' && v02.card).toBeUndefined();
    const q01 = parsed.modules[0]!.lessons[0]!.scenes[1];
    if (q01?.kind !== 'decision') throw new Error('Q01');
    expect(q01.situation).toBe('Você organiza os campeonatos do bairro.');
    expect(q01.voiceOptional).toBe(false);
    expect(q01.call).toBe('Agora é com você: o campeonato do bairro entra no currículo?');
    expect(q01.options.map((o) => [o.quality, o.destination])).toEqual([['strong', 'V02'], ['weak', 'V02'], ['ok', 'A01']]);
    expect(q01.options[0]).toMatchObject({ label: '"Coloco, sim."', feedback: 'É uma responsabilidade real.' });
    const q02 = parsed.modules[0]!.lessons[1]!.scenes[1];
    expect(q02?.kind === 'decision' && q02.voiceOptional).toBe(true);
  });

  it('composição, anotação, avaliação e FIM', () => {
    const [, , , a01, m01, fim1] = parsed.modules[0]!.lessons[0]!.scenes;
    expect(a01).toMatchObject({ kind: 'note', text: 'Em que situação alguém pôde contar com você?', skippable: true, destination: 'M01' });
    expect(m01).toMatchObject({ kind: 'scaffold', template: 'Eu já {experiencia}. Isso mostra que sei {habilidade}.', destination: 'FIM' });
    if (m01?.kind !== 'scaffold') throw new Error('M01');
    expect(m01.slots).toEqual([{ id: 'experiencia', options: ['ajudei na família', 'organizei um evento'] }, { id: 'habilidade', options: ['me comunicar', 'me organizar', 'trabalhar em equipe'] }]);
    expect(fim1).toMatchObject({ kind: 'end', takeaways: ['Experiência não é só emprego.', 'Conte o exemplo.'], myScript: ['minha frase (frase montada em M01)', 'minha anotação (A01), se preenchida'] });
    const [, , av01, fim2] = parsed.modules[0]!.lessons[1]!.scenes;
    if (av01?.kind !== 'assessment') throw new Error('AV01');
    expect(av01).toMatchObject({ attempts: 2, passMin: 1, passOf: 2, destination: 'FIM' });
    expect(av01.questions).toHaveLength(2);
    expect(av01.questions[0]).toEqual({ text: 'Qual situação entra no currículo?', alternatives: [{ label: 'Organizar um evento da escola', correct: true }, { label: 'Só carteira assinada', correct: false }], explanation: 'Atividades da escola contam.' });
    expect(av01.questions[1]!.alternatives.filter((a) => a.correct).map((a) => a.label)).toEqual(['Ajuda, mas não elimina']);
    expect(fim2).toMatchObject({ kind: 'end', checklist: { title: 'Minha busca', items: ['cadastro feito', 'três pessoas avisadas'] }, myScript: ['checklist "Minha busca"'] });
  });

  it('erros de formato apontam a linha; códigos repetidos são rejeitados', () => {
    expect(() => parseMarkdownCourse('Sem título')).toThrow(MarkdownCourseError);
    expect(() => parseMarkdownCourse(FIXTURE.replace('### V03 — Revisão', '### V01 — Revisão'))).toThrow(/código V01 repetido/);
    expect(() => parseMarkdownCourse(FIXTURE.replace('Montar frase: "Eu já {experiencia}. Isso mostra que sei {habilidade}."', ''))).toThrow(/M01 sem "Montar frase:"/);
  });

  it('duração-alvo: "N aulas de A a B minutos (cerca de XhYY)"', () => {
    expect(parseTargetDuration('12 aulas de 5 a 7 minutos (cerca de 1h15 no total).', 12)).toEqual({ lessonMinutes: 6, targetMinutes: 75 });
    expect(parseTargetDuration('3 aulas de 4 a 6 minutos', 3)).toEqual({ lessonMinutes: 5, targetMinutes: 15 });
    expect(parseTargetDuration('', 0)).toEqual({ lessonMinutes: undefined, targetMinutes: undefined });
  });
});

describe('markdownToCourseDocument (fixture)', () => {
  const parsed = parseMarkdownCourse(FIXTURE);
  const doc = markdownToCourseDocument(parsed, {
    presentation: { avatarId: 'av1', cameras: [{ id: 'cam_principal', name: 'Principal', lookId: 'look', nativeFraming: 'medium', angle: 'front', status: 'ready' }] },
    branding: { wordmark: 'Teste', subtitle: 'DNA Work', tagline: 'Uma frase curta.' },
    presenter: { name: 'Marina', role: 'Sua orientadora' },
    closingLine: 'Fecho.',
    audienceProfile: 'first_job',
    traits: ['shy'],
  });
  const nodes = nodesOf(doc);
  const l1 = doc.modules[0]!.lessons[0]!;
  const l2 = doc.modules[0]!.lessons[1]!;

  it('compila sem erros e os únicos avisos são os esperados (anotação sem objetivo, mídia ausente)', () => {
    const r = compileCourse(doc);
    expect(r.errors).toEqual([]);
    expect(new Set(r.warnings.map((w) => w.code))).toEqual(new Set(['NO_OBJECTIVE', 'MEDIA_MISSING']));
    expect(r.warnings.filter((w) => w.code === 'NO_OBJECTIVE').map((w) => w.nodeId)).toEqual(['a01']);
  });

  it('cabeçalho → briefing estruturado, resumo para o aluno, marca, elenco e apresentação em câmera única', () => {
    expect(doc.title).toBe('Curso de teste');
    expect(doc.learnerSummary).toBe('Um curso curtinho para treinar o formato do roteiro.');
    expect(doc.brief).toMatchObject({ topic: 'Um curso curtinho para treinar o formato do roteiro.', audience: 'jovens no primeiro emprego; tímidos.', finalSkill: 'Ao final, a pessoa reconhece o formato e monta uma frase.', targetMinutes: 10, audienceProfile: 'first_job', traits: ['shy'], interaction: { guidedChoices: true, voiceTraining: true, noWriting: true } });
    expect(doc.brief.context).toMatch(/Júlia, 21/);
    expect(doc.branding).toMatchObject({ theme: 'immersive', wordmark: 'Teste', subtitle: 'DNA Work', tagline: 'Uma frase curta.', presenterName: 'Marina', presenterRole: 'Sua orientadora' });
    expect(doc.branding.accent).toBeUndefined();
    expect(doc.cast.map((c) => c.name)).toEqual(['Marina', 'Júlia', 'Caio']);
    expect(doc.presentation.avatarId).toBe('av1');
    expect(doc.presentation.directionStyle.cameraMode).toBe('single');
    expect(doc.objectives.map((o) => o.id)).toEqual(['obj_aula_01', 'obj_aula_02']);
    expect(doc.objectives[0]!.title).toBe('Você reconhece o formato.');
    expect(doc.objectives[0]!.criterion).toMatch(/Q01.*M01/);
    expect(doc.completion.requiredLessonIds).toEqual(['aula_01', 'aula_02']);
    expect(doc.wizard.finished).toBe(true);
    expect(l1.estimatedMinutes).toBe(4);
  });

  it('vídeo: primeiro da aula é situação, os outros conteúdo; fala, palavras-chave na tela e direção com cartão que reproduz a fala', () => {
    const v01 = nodes.find((n) => n.id === 'v01');
    const v02 = nodes.find((n) => n.id === 'v02');
    expect(v01?.type).toBe('scenario');
    expect(v02?.type).toBe('content');
    if (v01?.type !== 'scenario' || v02?.type !== 'content') return;
    expect(richTextToPlain(v01.body)).toBe('Escola · Família · Bairro');
    expect(v01.narration?.startsWith('Muita gente trava')).toBe(true);
    expect(v01.direction).toBeDefined();
    const shots = v01.direction!.shots;
    expect(sameWords(shots.map((s) => s.line).join(' '), v01.narration!)).toBe(true);
    // cartão padrão: a apresentadora com o painel de tópicos (câmera principal, com gesto; sem variante clara/marinho)
    const card = shots.filter((s) => s.layout === 'presenter_panel');
    expect(card).toHaveLength(1);
    expect(card[0]!.slide).toMatchObject({ title: 'Isso também é experiência', bullets: ['Ajudar no **negócio da família**', 'Organizar **eventos** da escola', '**Voluntariado** e cursos'] });
    expect(card[0]!.slide!.variant).toBeUndefined();
    expect(card[0]!.cameraId).toBe('cam_principal');
    expect(card[0]!.motionPrompt).toBeTruthy();
    expect(card[0]!.cameraMove).toBe('static');
    expect(card[0]!.line).toMatch(/^Ajudar no negócio da família/);
    expect(spokenWords(card[0]!.line).length).toBeGreaterThanOrEqual(13);
    expect(spokenWords(card[0]!.line).length).toBeLessThanOrEqual(39);
    for (const s of shots.filter((x) => x.layout === 'presenter')) {
      expect(s.cameraId).toBe('cam_principal');
      expect(s.motionPrompt).toBeTruthy();
      expect(spokenWords(s.line).length).toBeLessThanOrEqual(26);
    }
    expect(shots[0]!.layout).toBe('presenter');
    expect(shots[shots.length - 1]!.layout).toBe('presenter');
    expect(v02.direction).toBeUndefined();
    expect(l1.graph.edges.find((e) => e.from === 'v01')?.to).toBe('q01');
  });

  it('decisão: opções com qualidade e retorno, voz opcional, arestas por opção com pontos (forte 2 / ok 1 / fraca 0)', () => {
    const q01 = nodes.find((n) => n.id === 'q01');
    const q02 = nodes.find((n) => n.id === 'q02');
    if (q01?.type !== 'choice' || q02?.type !== 'choice') throw new Error('decisões');
    expect(richTextToPlain(q01.prompt)).toBe('Você organiza os campeonatos do bairro.\nIsso entra?');
    expect(q01.options.map((o) => [o.id, o.quality])).toEqual([['a', 'strong'], ['b', 'weak'], ['c', 'ok']]);
    expect(richTextToPlain(q01.options[0]!.feedback)).toBe('É uma responsabilidade real.');
    expect(q01.openAnswer).toBeUndefined();
    expect(q02.openAnswer).toEqual({ enabled: true, voice: true, text: false, matchPrompt: 'Qual destas respostas se parece mais com a sua?' });
    const edges = l1.graph.edges.filter((e) => e.from === 'q01');
    expect(edges.map((e) => [e.optionId, e.to, e.effects?.[0]?.op === 'inc' ? e.effects[0].by : 0])).toEqual([['a', 'v02', 2], ['b', 'v02', 0], ['c', 'a01', 1]]);
    expect(l1.graph.variables).toEqual([{ name: 'pontos', type: 'number', initial: 0, label: 'Pontos da aula', scope: 'lesson' }]);
  });

  it('composição guiada e anotação viram reflexões sem mínimo; "Monte sua frase" com molde e blocos', () => {
    const m01 = nodes.find((n) => n.id === 'm01');
    const a01 = nodes.find((n) => n.id === 'a01');
    if (m01?.type !== 'reflection' || a01?.type !== 'reflection') throw new Error('reflexões');
    expect(m01.minLength).toBe(0);
    expect(m01.scaffold?.template).toBe('Eu já {experiencia}. Isso mostra que sei {habilidade}.');
    expect(m01.scaffold?.slots.map((s) => [s.id, s.options.length, s.allowCustom])).toEqual([['experiencia', 2, true], ['habilidade', 3, true]]);
    expect(a01.minLength).toBe(0);
    expect(a01.scaffold).toBeUndefined();
    expect(a01.placeholder).toBe('Em que situação alguém pôde contar com você?');
    expect(richTextToPlain(a01.prompt)).toMatch(/pode pular/);
    expect(l1.graph.edges.find((e) => e.from === 'a01')?.to).toBe('m01');
    expect(l1.graph.edges.find((e) => e.from === 'm01')?.to).toBe('fim_aula_01');
  });

  it('avaliação: uma cena por pergunta, tentativas, explicação, variável acertos e "Aprovação: X de Y" decidindo o encerramento', () => {
    const qs = byType(l2.graph.nodes, 'assessment');
    expect(qs.map((q) => q.id)).toEqual(['av01_q1', 'av01_q2']);
    expect(qs[0]).toMatchObject({ maxAttempts: 2, mode: 'single', passing: { kind: 'all_correct' }, objectiveIds: ['obj_aula_01', 'obj_aula_02'] });
    expect(qs[0]!.options.map((o) => [o.id, o.correct])).toEqual([['a', true], ['b', false]]);
    expect(richTextToPlain(qs[0]!.feedbackFailed)).toBe('Atividades da escola contam.');
    expect(l2.graph.variables.map((v) => v.name)).toEqual(['pontos', 'acertos']);
    const e1 = l2.graph.edges.filter((e) => e.from === 'av01_q1');
    expect(e1).toHaveLength(2);
    expect(e1[0]).toMatchObject({ to: 'av01_q2', condition: { op: 'passed', nodeId: 'av01_q1' }, effects: [{ op: 'inc', var: 'acertos', by: 1 }], priority: 1 });
    expect(e1[1]).toMatchObject({ to: 'av01_q2', isDefault: true });
    const e2 = l2.graph.edges.filter((e) => e.from === 'av01_q2');
    expect(e2.map((e) => e.to)).toEqual(['fim_aula_02', 'fim_aula_02', 'fim_aula_02_revisar']);
    expect(e2[0]!.condition).toEqual({ op: 'and', conditions: [{ op: 'gte', var: 'acertos', value: 0 }, { op: 'passed', nodeId: 'av01_q2' }] });
    expect(e2[1]!.condition).toEqual({ op: 'gte', var: 'acertos', value: 1 });
    expect(l2.graph.edges.find((e) => e.from === 'q02' && e.optionId === 'a')?.to).toBe('av01_q1');
    const ends = byType(l2.graph.nodes, 'end');
    expect(ends.map((e) => e.id)).toEqual(['fim_aula_02', 'fim_aula_02_revisar']);
    expect(richTextToPlain(ends[1]!.summary)).toMatch(/menos de 1 de 2/);
    expect(ends[1]!.outcomeLabel).toBe('Curso concluído');
  });

  it('FIM: encerramento com "O que você levou", frase de fechamento e roteiro (frase montada, anotação, checklist, tópicos)', () => {
    const fim1 = byType(l1.graph.nodes, 'end')[0]!;
    expect(fim1.closingLine).toBe('Fecho.');
    expect(fim1.outcomeLabel).toBe('Aula concluída');
    expect(richTextToPlain(fim1.summary)).toBe('O que você levou\nExperiência não é só emprego.\nConte o exemplo.');
    expect(fim1.recap?.map((r) => [r.id, r.kind, r.label])).toEqual([
      ['m01', 'reflection', 'Minha frase'],
      ['a01', 'reflection', 'Minha anotação'],
      ['o_que_levou', 'text', 'O que você levou'],
    ]);
    expect(fim1.recap?.[0]).toMatchObject({ nodeId: 'm01', composedNodeIds: ['m01'], emptyText: 'Monte na aula 1' });
    expect(fim1.recap?.[2]?.text).toBe('Experiência não é só emprego.\nConte o exemplo.');
    const fim2 = byType(l2.graph.nodes, 'end')[0]!;
    expect(fim2.recap?.map((r) => [r.id, r.kind])).toEqual([['checklist', 'checklist'], ['o_que_levou', 'text']]);
    expect(fim2.recap?.[0]).toMatchObject({ label: 'Minha busca', items: ['cadastro feito', 'três pessoas avisadas'] });
  });

  it('destino inexistente ou em outra aula é erro; sem direção, o cartão vai para a tela com aviso', () => {
    expect(() => markdownToCourseDocument(parseMarkdownCourse(FIXTURE.replace('| V02 |\n| "Não coloco."', '| V99 |\n| "Não coloco."')))).toThrow(/destino "V99" de Q01\/a não existe/);
    expect(() => markdownToCourseDocument(parseMarkdownCourse(FIXTURE.replace('Destino: M01', 'Destino: Q02')))).toThrow(/está em outra aula/);
    const r = importMarkdownCourse(FIXTURE, { direction: false });
    const v01 = nodesOf(r.document).find((n) => n.id === 'v01');
    expect(v01?.type === 'scenario' && v01.direction).toBeUndefined();
    expect(v01?.type === 'scenario' && richTextToPlain(v01.body)).toMatch(/Isso também é experiência\nAjudar no negócio da família/);
    expect(r.warnings.map((w) => w.code)).toContain('CARD_WITHOUT_DIRECTION');
    expect(r.compile.errors).toEqual([]);
  });
});

describe('buildCardDirection: câmera em tela cheia e painel', () => {
  const narration = 'Muita gente trava logo no começo. Experiência não é só carteira assinada. Ajudar no negócio da família, organizar um evento da escola, cuidar das redes de um projeto, treinar um time do bairro: tudo isso mostra o que você sabe fazer. A pergunta certa é onde você já assumiu uma responsabilidade.';
  const card = { title: 'Isso também é experiência', bullets: ['Ajudar no **negócio da família**', 'Organizar **eventos** da escola'] };
  it('full_frame: todos os planos no enquadramento nativo e estáticos (sem zoom digital); o cartão vira presenter_panel', () => {
    const d = buildCardDirection(narration, card, { cameraId: 'cam_cenario', variant: 'light', sceneTitle: 'x', fullFrameNative: 'medium' })!;
    expect(d.shots.every((s) => s.framing === 'medium' && s.cameraMove === 'static')).toBe(true);
    expect(d.shots.filter((s) => s.layout === 'presenter_panel')).toHaveLength(1);
    expect(d.shots.every((s) => s.cameraId === 'cam_cenario')).toBe(true);
  });
  it('cardLayout card mantém o cartão em tela cheia antigo', () => {
    const d = buildCardDirection(narration, card, { variant: 'navy', sceneTitle: 'x', cardLayout: 'card' })!;
    expect(d.shots.find((s) => s.layout === 'card')?.slide?.variant).toBe('navy');
  });
  it('importação: câmera principal full_frame → planos no enquadramento nativo dela, estáticos', () => {
    const r = importMarkdownCourse(readFileSync(REAL_SCRIPT, 'utf8'), {
      presentation: { avatarId: 'av', cameras: [{ id: 'cam_cenario', name: 'Cenário', lookId: 'look', nativeFraming: 'wide', angle: 'left', status: 'ready', placement: 'full_frame' }] },
    });
    const directed = allLessons(r.document).flatMap((l) => l.graph.nodes).filter((n) => (n.type === 'scenario' || n.type === 'content') && n.direction);
    expect(directed.length).toBeGreaterThan(0);
    for (const n of directed) {
      if (n.type !== 'scenario' && n.type !== 'content') continue;
      for (const s of n.direction!.shots) {
        expect(s.framing, `${n.id}/${s.id}`).toBe('wide');
        expect(s.cameraMove).toBe('static');
      }
    }
  });
});

describe('buildCardDirection', () => {
  it('fala curta demais ou sem trecho de cartão → sem direção', () => {
    expect(buildCardDirection('Uma frase só.', { title: 'T', bullets: ['a'] }, { variant: 'light', sceneTitle: 'x' })).toBeUndefined();
    expect(buildCardDirection('Oi. Tchau.', { title: 'T', bullets: ['a'] }, { variant: 'light', sceneTitle: 'x' })).toBeUndefined();
  });
  it('frases com aspas e reticências ficam inteiras', () => {
    expect(splitSentences(`Pensa: 'não dá?'. Calma… Vai dar. "Sério?" Sim`)).toEqual([`Pensa: 'não dá?'.`, 'Calma…', 'Vai dar.', '"Sério?"', 'Sim']);
  });
});

describe('roteiro real: docs/roteiros/curso-primeira-vaga.md', () => {
  const md = readFileSync(REAL_SCRIPT, 'utf8');
  const r = importMarkdownCourse(md, {
    presentation: { avatarId: 'av', cameras: [{ id: 'cam_principal', name: 'Principal', lookId: 'look', nativeFraming: 'medium', angle: 'front', status: 'ready' }] },
    branding: { wordmark: 'Primeira Vaga', subtitle: 'DNA Work' },
    presenter: { name: 'Marina', role: 'Sua orientadora' },
    audienceProfile: 'first_job',
    traits: ['shy'],
  });
  const scenes = r.parsed.modules.flatMap((m) => m.lessons.flatMap((l) => l.scenes));
  const count = (k: string) => scenes.filter((s) => s.kind === k).length;

  it('4 módulos, 12 aulas, 24 vídeos (com a boas-vindas V00), 24 decisões, 10 composições, 4 avaliações, 0 anotações, 12 FIM', () => {
    expect(r.parsed.title).toBe('Primeira Vaga');
    expect(r.parsed.modules).toHaveLength(4);
    expect(r.parsed.modules.reduce((a, m) => a + m.lessons.length, 0)).toBe(12);
    expect(count('video')).toBe(24);
    expect(count('decision')).toBe(24);
    expect(count('scaffold')).toBe(10);
    expect(count('assessment')).toBe(4);
    expect(count('note')).toBe(0);
    expect(count('end')).toBe(12);
    expect(scenes.filter((s) => s.kind === 'video' && s.card)).toHaveLength(15);
    expect(scenes.filter((s) => s.kind === 'decision' && s.voiceOptional).map((s) => s.code)).toEqual(['Q17', 'Q18', 'Q21', 'Q22', 'Q23', 'Q25']);
  });

  it('aspas tipográficas nas opções e rótulos de lacuna com acento', () => {
    const q01 = nodesOf(r.document).find((n) => n.id === 'q01');
    expect(q01 && q01.type === 'choice' ? q01.options.map((o) => o.label) : []).toEqual(expect.arrayContaining([expect.stringMatching(/^“.+”$/)]));
    expect(q01 && q01.type === 'choice' ? q01.options.some((o) => o.label.includes('"')) : true).toBe(false);
    const m01 = nodesOf(r.document).find((n) => n.id === 'm01');
    const labels = m01 && m01.type === 'reflection' ? m01.scaffold!.slots.map((sl) => sl.label) : [];
    expect(labels).toContain('experiência');
    expect(labels).toContain('ação');
  });

  it('compila com 0 erros; meta de 75 min; todos os cartões viraram direção que reproduz a fala', () => {
    expect(r.compile.errors).toEqual([]);
    expect(r.document.brief.targetMinutes).toBe(75);
    expect(r.document.modules.map((m) => m.lessons.length)).toEqual([3, 3, 2, 4]);
    const directed = nodesOf(r.document).filter((n) => (n.type === 'scenario' || n.type === 'content') && n.direction);
    expect(directed).toHaveLength(15);
    for (const n of directed) {
      if (n.type !== 'scenario' && n.type !== 'content') continue;
      expect(sameWords(n.direction!.shots.map((s) => s.line).join(' '), n.narration!), n.id).toBe(true);
      expect(n.direction!.shots.filter((s) => s.layout === 'presenter_panel'), n.id).toHaveLength(1);
      expect(n.direction!.shots.filter((s) => s.layout === 'card'), n.id).toHaveLength(0);
    }
    expect(r.warnings.map((w) => w.code)).not.toContain('CARD_WITHOUT_DIRECTION');
    // cada aula termina; avaliação de módulo no fim das aulas 3, 6, 8 e 12
    expect(r.lessons.map((l) => l.nodes)).toEqual([7, 6, 9, 6, 6, 9, 6, 9, 6, 6, 7, 9]);
    expect(courseLengthReport(r.document).warnings).toEqual([]);
    const codes = new Set(r.compile.warnings.map((w) => w.code));
    expect([...codes].sort()).toEqual(['MEDIA_MISSING']); // a anotação livre saiu do roteiro: nenhuma cena sem objetivo
  });
});

describe('estúdio com zonas: importação', () => {
  const zoneCams = [
    { id: 'cam_estudio_34', name: 'Estúdio · 3/4', lookId: 'l34', nativeFraming: 'medium' as const, angle: 'left' as const, status: 'ready' as const, placement: 'full_frame' as const, zone: 'center' as const },
    { id: 'cam_estudio_esq', name: 'Estúdio · esquerda', lookId: 'lesq', nativeFraming: 'medium' as const, angle: 'front' as const, status: 'ready' as const, placement: 'full_frame' as const, zone: 'left' as const },
    { id: 'cam_estudio_dir', name: 'Estúdio · direita', lookId: 'ldir', nativeFraming: 'medium' as const, angle: 'front' as const, status: 'ready' as const, placement: 'full_frame' as const, zone: 'right' as const },
  ];

  it('roteiro real: todos os vídeos dirigidos; pílulas numa câmera lateral alternando o lado na aula; fala em câmeras de zona; sem zoom', () => {
    const r = importMarkdownCourse(readFileSync(REAL_SCRIPT, 'utf8'), { presentation: { avatarId: 'l34', cameras: zoneCams } });
    expect(r.compile.errors).toEqual([]);
    for (const lesson of allLessons(r.document)) {
      const videos = lesson.graph.nodes.filter((n) => n.type === 'scenario' || n.type === 'content');
      let prevSide: string | undefined;
      for (const n of videos) {
        if (n.type !== 'scenario' && n.type !== 'content') continue;
        expect(n.direction, n.id).toBeDefined();
        expect(sameWords(n.direction!.shots.map((s) => s.line).join(' '), n.narration!), n.id).toBe(true);
        for (const s of n.direction!.shots) {
          expect(['cam_estudio_34', 'cam_estudio_esq', 'cam_estudio_dir']).toContain(s.cameraId);
          expect(s.cameraMove).toBe('static');
          expect(s.layout).not.toBe('presenter_panel');
        }
        const chips = n.direction!.shots.filter((s) => s.layout === 'presenter_chips');
        for (const c of chips) {
          expect(c.cameraId, `${n.id}: pílulas nunca na 3/4`).not.toBe('cam_estudio_34');
          expect(c.cameraId, `${n.id}: nunca dois planos de pílulas do mesmo lado`).not.toBe(prevSide);
          prevSide = c.cameraId;
          expect(c.slide!.bullets.length).toBeGreaterThanOrEqual(2);
        }
        // cortes de câmera só entre frases
        n.direction!.shots.forEach((s, i) => {
          const prev = n.direction!.shots[i - 1];
          if (prev && prev.cameraId !== s.cameraId) expect(prev.line, `${n.id}/${s.id}`).toMatch(/[.!?…]["'”’»)]*$/);
        });
      }
    }
    const chipsShots = nodesOf(r.document).flatMap((n) => ((n.type === 'scenario' || n.type === 'content') && n.direction ? n.direction.shots : [])).filter((s) => s.layout === 'presenter_chips');
    expect(chipsShots).toHaveLength(15);
  });

  it('as falas sem cartão alternam a câmera entre as cenas (3/4 nas pares, laterais nas ímpares)', () => {
    const doc = markdownToCourseDocument(parseMarkdownCourse(FIXTURE), { presentation: { avatarId: 'l34', cameras: zoneCams } });
    const lesson1 = allLessons(doc)[0]!;
    const v01 = lesson1.graph.nodes.find((n) => n.id === 'v01');
    const v02 = lesson1.graph.nodes.find((n) => n.id === 'v02');
    if (v01?.type !== 'scenario' || v02?.type !== 'content') throw new Error('fixture');
    // V01: fala na 3/4 (cena 0); cartão = pílulas na lateral esquerda (primeiras pílulas: apresentadora à esquerda)
    // (o último plano é a chamada para a pergunta Q01: olho no olho, na câmera frontal)
    expect(v01.direction!.shots.filter((s) => s.layout === 'presenter' && s.id !== CALL_SHOT_ID).every((s) => s.cameraId === 'cam_estudio_34')).toBe(true);
    expect(v01.direction!.shots.at(-1)).toMatchObject({ id: CALL_SHOT_ID, layout: 'presenter', cameraId: 'cam_estudio_esq', line: 'Agora é com você: o campeonato do bairro entra no currículo?' });
    expect(v01.direction!.shots.find((s) => s.layout === 'presenter_chips')?.cameraId).toBe('cam_estudio_esq');
    // V02 (sem cartão): direção só de fala na câmera lateral da cena 1
    expect(v02.direction!.shots.every((s) => s.layout === 'presenter' && s.cameraId === 'cam_estudio_esq')).toBe(true);
  });

  it('sem câmeras de zona: igual a antes (painel, sem direção nas falas sem cartão)', () => {
    const doc = markdownToCourseDocument(parseMarkdownCourse(FIXTURE), { presentation: { avatarId: 'look', cameras: [{ id: 'cam_principal', name: 'P', lookId: 'look', nativeFraming: 'medium', angle: 'front', status: 'ready' }] } });
    const nodes = nodesOf(doc);
    const v02 = nodes.find((n) => n.id === 'v02');
    expect(v02 && 'direction' in v02 ? v02.direction : undefined).toBeUndefined();
    const v01 = nodes.find((n) => n.id === 'v01');
    expect(v01?.type === 'scenario' ? v01.direction!.shots.some((s) => s.layout === 'presenter_panel') : false).toBe(true);
  });
});
