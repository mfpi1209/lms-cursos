import { describe, expect, it } from 'vitest';
import { compileCourse } from '../src/compile';
import { courseLengthReport } from '../src/length';
import { allLessons } from '../src/course';
import { richTextToPlain } from '../src/richtext';
import { spokenWords } from '../src/direction';
import { podeEntrar, podeEntrarLight, PODE_ENTRAR_LIGHT_LESSON_IDS, PODE_ENTRAR_LIGHT_NOTE_ID, PODE_ENTRAR_LIGHT_Q03_NARRATION, PODE_ENTRAR_LIGHT_TITLE, PODE_ENTRAR_LIGHT_VIDEO_NODE_ID } from '../src/examples';

const lessons = allLessons(podeEntrarLight);
const nodes = lessons.flatMap((l) => l.graph.nodes);
const byId = new Map(nodes.map((n) => [n.id, n]));
const words = (t: string | undefined) => spokenWords(t ?? '').length;
const sentences = (t: string) => t.split(/[.!?…](?=["”»)]?(\s|$))/u).map((x) => x.trim()).filter((x) => x && !/^["”»)]$/.test(x));

describe('curso "Pode entrar Light"', () => {
  it('compila sem erros; o único aviso é a anotação opcional sem objetivo', () => {
    const r = compileCourse(podeEntrarLight);
    expect(r.errors).toEqual([]);
    // o exemplo tem apresentador mas é só texto: cada cena narrada sem vídeo vira MEDIA_MISSING (estado da mídia, não do roteiro);
    // CHOICE_NO_CALL/REACTION_MISSING: o exemplo é anterior à ponte vídeo → pergunta e às reações (bridge.ts, reaction.ts)
    for (const w of r.warnings.filter((w) => w.code !== 'MEDIA_MISSING' && w.code !== 'CHOICE_NO_CALL' && w.code !== 'REACTION_MISSING')) {
      expect(w.code).toBe('NO_OBJECTIVE');
      expect(w.nodeId).toBe(PODE_ENTRAR_LIGHT_NOTE_ID);
    }
  });

  it('três aulas obrigatórias, meta de 10 minutos, marca "Versão rápida" e só primeiro emprego (sem perfil)', () => {
    expect(podeEntrarLight.title).toBe(PODE_ENTRAR_LIGHT_TITLE);
    expect(lessons.map((l) => l.id)).toEqual([...PODE_ENTRAR_LIGHT_LESSON_IDS]);
    expect(podeEntrarLight.completion.requiredLessonIds).toEqual([...PODE_ENTRAR_LIGHT_LESSON_IDS]);
    expect(podeEntrarLight.brief.targetMinutes).toBe(10);
    expect(podeEntrarLight.branding).toMatchObject({ wordmark: 'pode entrar', subtitle: 'Versão rápida', presenterName: 'Marina', presenterRole: 'Sua entrevistadora' });
    expect(podeEntrarLight.branding.accent).toBeUndefined(); // herda o acento da plataforma (preset do workspace)
    expect(podeEntrarLight.presentation).toMatchObject({ presenterPlacement: 'right', presenterScale: 0.92, avatarId: podeEntrar.presentation.avatarId, voiceId: podeEntrar.presentation.voiceId });
    for (const l of lessons) {
      expect(l.graph.variables.some((v) => v.name === 'perfil'), l.id).toBe(false);
      expect(l.graph.variables.every((v) => v.scope !== 'course'), l.id).toBe(true);
    }
    expect(byId.size).toBe(nodes.length);
  });

  it('cada aula tem até 5 cenas além do encerramento; o curso fica em até 700 palavras na tela e perto de 10 min', () => {
    for (const l of lessons) expect(l.graph.nodes.filter((n) => n.type !== 'end').length, l.id).toBeLessThanOrEqual(5);
    const r = courseLengthReport(podeEntrarLight);
    expect(r.totals.screenWords).toBeLessThanOrEqual(700);
    expect(r.totals.estMinutes).toBeLessThanOrEqual(12);
    expect(r.warnings).toEqual([]);
  });

  it('decisões: 3 opções; pergunta ≤ 14 palavras; opção ≤ 12; retorno de UMA frase ≤ 18 palavras, em 2ª pessoa, e as não-melhores dizem o movimento melhor', () => {
    const decisions = nodes.filter((n) => n.type === 'choice');
    expect(decisions).toHaveLength(9);
    for (const n of decisions) {
      if (n.type !== 'choice') continue;
      expect(n.options, n.id).toHaveLength(3);
      expect(words(richTextToPlain(n.prompt)), `${n.id}: pergunta`).toBeLessThanOrEqual(14);
      const withBetter = n.options.filter((o) => /\bmelhor\b/i.test(richTextToPlain(o.feedback)));
      expect(withBetter, `${n.id}: exatamente duas opções apontam o melhor movimento`).toHaveLength(2);
      for (const o of n.options) {
        const fb = richTextToPlain(o.feedback);
        expect(words(o.label), `${n.id}/${o.id}: opção`).toBeLessThanOrEqual(12);
        expect(words(fb), `${n.id}/${o.id}: retorno`).toBeLessThanOrEqual(18);
        expect(sentences(fb), `${n.id}/${o.id}: uma frase`).toHaveLength(1);
        expect(fb, `${n.id}/${o.id}: segunda pessoa`).toMatch(/^Você\s/);
      }
    }
  });

  it('sem reforços nem segunda tentativa: todas as opções de uma decisão seguem para a mesma cena, sempre adiante', () => {
    for (const l of lessons) {
      const order = new Map(l.graph.nodes.map((n, i) => [n.id, i]));
      for (const n of l.graph.nodes) {
        const outs = l.graph.edges.filter((e) => e.from === n.id);
        if (n.type === 'choice') expect(new Set(outs.map((e) => e.to)).size, n.id).toBe(1);
        for (const e of outs) expect(order.get(e.to)!, `${e.id}`).toBeGreaterThan(order.get(n.id)!);
      }
    }
  });

  it('sem escrita obrigatória: uma única anotação opcional; voz só como treino opcional nas 3 perguntas da conversa', () => {
    const reflections = nodes.filter((n) => n.type === 'reflection');
    expect(reflections.map((n) => n.id)).toEqual([PODE_ENTRAR_LIGHT_NOTE_ID]);
    const note = reflections[0]!;
    expect(note.type === 'reflection' && note.minLength).toBe(0);
    expect(richTextToPlain(note.type === 'reflection' ? note.prompt : undefined)).toBe('Quer anotar sua apresentação? É opcional.');
    const voice = nodes.filter((n) => n.type === 'choice' && n.openAnswer?.enabled);
    expect(voice.map((n) => n.id)).toEqual([PODE_ENTRAR_LIGHT_VIDEO_NODE_ID, 'l2_algo_que_fez', 'l2_nao_souber']);
    for (const n of voice) if (n.type === 'choice') expect(n.openAnswer).toMatchObject({ voice: true, text: false });
  });

  it('o vídeo curto (≤ 40 palavras de fala, tela em palavras-chave) e a fala da Q03 idêntica à do "Pode entrar"', () => {
    const narrated = nodes.filter((n) => 'narration' in n && n.narration);
    for (const n of narrated) {
      expect(words((n as { narration: string }).narration), n.id).toBeLessThanOrEqual(40);
      if (n.type === 'content' || n.type === 'scenario') expect(words(richTextToPlain(n.body)), n.id).toBeLessThanOrEqual(12);
    }
    const q03 = allLessons(podeEntrar).flatMap((l) => l.graph.nodes).find((n) => n.id === 'q03_primeiro_emprego')!;
    const light = byId.get(PODE_ENTRAR_LIGHT_VIDEO_NODE_ID)!;
    expect('narration' in light && light.narration).toBe(PODE_ENTRAR_LIGHT_Q03_NARRATION);
    expect('narration' in q03 && q03.narration).toBe(PODE_ENTRAR_LIGHT_Q03_NARRATION);
    expect('motionPrompt' in light && light.motionPrompt).toBe('motionPrompt' in q03 ? q03.motionPrompt : undefined);
    // nenhuma mídia no exemplo (o script de inserção liga o vídeo da Q03)
    for (const n of nodes) expect('media' in n && n.media, n.id).toBeFalsy();
  });

  it('recap: escolhas + checklist "Dia da entrevista" (5 itens) + anotação opcional', () => {
    const ends = lessons[2]!.graph.nodes.filter((n) => n.type === 'end');
    expect(ends.map((n) => n.id)).toEqual(['l3_fim_bom', 'l3_fim_quase']);
    for (const end of ends) {
      if (end.type !== 'end') continue;
      const items = end.recap ?? [];
      expect(items.filter((i) => i.kind === 'checklist').map((i) => [i.label, i.items?.length])).toEqual([['Dia da entrevista', 5]]);
      expect(items.filter((i) => i.kind === 'reflection').map((i) => [i.nodeId, i.emptyText])).toEqual([[PODE_ENTRAR_LIGHT_NOTE_ID, 'Se quiser, escreva depois']]);
      for (const i of items.filter((x) => x.kind === 'choice')) expect(byId.get(i.nodeId!)?.type, i.id).toBe('choice');
    }
  });
});
