import { describe, expect, it } from 'vitest';
import { richTextFromPlain as p, type AnyNode, type EndNode, type LessonGraph } from '@lms/course-schema';
import { applyIntent, computeProgress, createInitialState, editMission, EngineError, mergeLessonMission, recapToPlainText, resolveRecap } from '../src';

const now = new Date('2026-01-01T00:00:00Z');

function graph(): LessonGraph {
  const nodes: AnyNode[] = [
    { id: 'pratica', type: 'reflection', title: 'Sua frase', prompt: p('Monte'), objectiveIds: [], required: true, minLength: 0, maxLength: 500 },
    { id: 'missao', type: 'mission', title: 'Leve para a vida real', objectiveIds: [], required: true, intro: 'Para treinar.', action: 'Hoje, ofereça ajuda.', alternative: 'Treine com um colega.', draftFromNodeId: 'pratica' },
    { id: 'fim', type: 'end', summary: p('fim'), objectiveIds: [], required: true, recap: [{ id: 'm', label: 'Minha missão', kind: 'mission', nodeId: 'missao', emptyText: 'Disponível quando você chegar lá' }] },
  ];
  return {
    schemaVersion: 1,
    startNodeId: 'pratica',
    variables: [],
    nodes,
    edges: [
      { id: 'e1', from: 'pratica', to: 'missao' },
      { id: 'e2', from: 'missao', to: 'fim' },
    ],
    layout: { positions: {} },
  };
}
const atMission = () => applyIntent(graph(), createInitialState(graph(), now), { kind: 'reflect', text: 'Posso ajudar com isso?' }, now).state;

describe('missão no motor', () => {
  it('"Vou fazer depois" avança e conclui a aula (a missão nunca bloqueia)', () => {
    const r = applyIntent(graph(), atMission(), { kind: 'mission', status: 'later' }, now);
    expect(r.state.status).toBe('completed');
    expect(r.state.answers.missao).toMatchObject({ missionStatus: 'later' });
    expect(r.state.answers.missao?.text).toBeUndefined();
    expect(r.evidence).toEqual([]);
    expect(computeProgress(graph(), r.state).percent).toBe(100);
  });
  it('"Já experimentei" guarda o que a pessoa percebeu (sem espaços nas pontas)', () => {
    const r = applyIntent(graph(), atMission(), { kind: 'mission', status: 'done', note: '  Funcionou.  ' }, now);
    expect(r.state.answers.missao).toMatchObject({ missionStatus: 'done', text: 'Funcionou.' });
  });
  it('"Já experimentei" sem texto também vale (o registro é opcional)', () => {
    const r = applyIntent(graph(), atMission(), { kind: 'mission', status: 'done' }, now);
    expect(r.state.answers.missao?.missionStatus).toBe('done');
    expect(r.state.status).toBe('completed');
  });
  it('recusa texto acima de 500 caracteres, texto com "depois", intenção errada e status inválido', () => {
    const code = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        return (e as EngineError).code;
      }
    };
    expect(code(() => applyIntent(graph(), atMission(), { kind: 'mission', status: 'done', note: 'a'.repeat(501) }, now))).toBe('TEXT_TOO_LONG');
    expect(code(() => applyIntent(graph(), atMission(), { kind: 'mission', status: 'later', note: 'x' }, now))).toBe('INVALID_MISSION');
    expect(code(() => applyIntent(graph(), atMission(), { kind: 'advance' }, now))).toBe('INTENT_MISMATCH');
    expect(code(() => applyIntent(graph(), atMission(), { kind: 'mission', status: 'talvez' as 'done' }, now))).toBe('INVALID_MISSION');
    expect(applyIntent(graph(), atMission(), { kind: 'mission', status: 'done', note: 'a'.repeat(500) }, now).state.status).toBe('completed');
  });
});

describe('mergeLessonMission / editMission (regras puras)', () => {
  it('sem registro vale o que veio; "depois" nunca leva texto', () => {
    expect(mergeLessonMission(null, { status: 'later', note: 'x' })).toEqual({ status: 'later', note: null });
    expect(mergeLessonMission(undefined, { status: 'done', note: ' ok ' })).toEqual({ status: 'done', note: 'ok' });
  });
  it('quem já experimentou não é rebaixado por "depois" e só troca o texto se veio texto', () => {
    const done = { status: 'done' as const, note: 'antes' };
    expect(mergeLessonMission(done, { status: 'later' })).toEqual(done);
    expect(mergeLessonMission(done, { status: 'done' })).toEqual(done);
    expect(mergeLessonMission(done, { status: 'done', note: 'depois' })).toEqual({ status: 'done', note: 'depois' });
  });
  it('de "depois" para "experimentei" promove; "depois" de novo não muda', () => {
    const later = { status: 'later' as const, note: null };
    expect(mergeLessonMission(later, { status: 'later' })).toEqual(later);
    expect(mergeLessonMission(later, { status: 'done', note: 'ok' })).toEqual({ status: 'done', note: 'ok' });
  });
  it('edição fora da aula: avança, apaga o texto com vazio e não volta para "depois"', () => {
    expect(editMission({ status: 'later', note: null }, { status: 'done', note: 'Percebi.' })).toEqual({ ok: true, next: { status: 'done', note: 'Percebi.' } });
    expect(editMission({ status: 'done', note: 'a' }, { status: 'done', note: '  ' })).toEqual({ ok: true, next: { status: 'done', note: null } });
    expect(editMission({ status: 'done', note: 'a' }, { status: 'later' })).toEqual({ ok: false, problem: 'LATER_AFTER_DONE' });
    expect(editMission({ status: 'later', note: null }, { status: 'later' })).toEqual({ ok: true, next: { status: 'later', note: null } });
    expect(editMission({ status: 'later', note: null }, { status: 'done', note: 'a'.repeat(501) })).toEqual({ ok: false, problem: 'NOTE_TOO_LONG' });
  });
});

describe('"Meu roteiro" com a missão', () => {
  const g = graph();
  const end = g.nodes.find((n) => n.type === 'end') as EndNode;
  it('sem registro: estado "none" e a ação visível; o texto de vazio continua', () => {
    const [it] = resolveRecap(g, end, createInitialState(g, now));
    expect(it).toMatchObject({ kind: 'mission', value: null, mission: { status: 'none', nodeId: 'missao', title: 'Leve para a vida real', action: 'Hoje, ofereça ajuda.', alternative: 'Treine com um colega.' } });
  });
  it('resposta da tentativa atual: "depois" e "experimentei" com o texto', () => {
    const later = applyIntent(g, atMission(), { kind: 'mission', status: 'later' }, now).state;
    expect(resolveRecap(g, end, later)[0]?.mission).toMatchObject({ status: 'later', note: null });
    const done = applyIntent(g, atMission(), { kind: 'mission', status: 'done', note: 'Deu certo.' }, now).state;
    expect(resolveRecap(g, end, done)[0]).toMatchObject({ value: 'Deu certo.', mission: { status: 'done', note: 'Deu certo.' } });
  });
  it('o registro do banco (editado depois da aula) vale mais que a tentativa', () => {
    const later = applyIntent(g, atMission(), { kind: 'mission', status: 'later' }, now).state;
    const items = resolveRecap(g, end, later, { missions: { missao: { lessonId: 'aula', status: 'done', note: 'Contei para a gerente.', revision: 3, updatedAt: now.toISOString() } } });
    expect(items[0]).toMatchObject({ value: 'Contei para a gerente.', mission: { status: 'done', revision: 3 } });
  });
  it('texto simples do roteiro traz a ação e o estado', () => {
    const txt = recapToPlainText('Meu roteiro', resolveRecap(g, end, createInitialState(g, now)));
    expect(txt).toContain('Hoje, ofereça ajuda.');
    expect(txt).toContain('Ainda não registrei');
    const done = recapToPlainText('Meu roteiro', resolveRecap(g, end, applyIntent(g, atMission(), { kind: 'mission', status: 'done', note: 'Deu certo.' }, now).state));
    expect(done).toContain('Já experimentei');
    expect(done).toContain('O que percebi: Deu certo.');
  });
});
