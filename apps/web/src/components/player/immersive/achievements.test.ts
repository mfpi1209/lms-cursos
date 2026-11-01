import { describe, expect, it } from 'vitest';
import { lessonAchievements, practiceChipLabel, realLifeChipLabel } from './achievements';

const NODES = [
  { id: 'v1', type: 'scenario' },
  { id: 'q1', type: 'choice' },
  { id: 'q2', type: 'choice' },
  { id: 'm1', type: 'reflection' },
  { id: 'a1', type: 'assessment' },
  { id: 'vida', type: 'mission' },
  { id: 'fim', type: 'end' },
];
const path = (...ids: string[]) => ids.map((nodeId) => ({ nodeId }));

describe('conquistas do fim da aula', () => {
  it('quem salvou uma resposta na atividade ganha "Prática feita"', () => {
    const a = lessonAchievements(NODES, { path: path('v1', 'q1', 'q2', 'm1', 'fim'), answers: { m1: { text: 'Eu confirmo o horário.' } } });
    expect(a).toEqual({ choices: 2, practices: 1, skippedPractices: 0, reviews: 0 });
    expect(practiceChipLabel(a)).toEqual({ label: 'Prática feita', done: true });
  });
  it('"Fazer depois" (texto vazio) visita a atividade mas não cumpre a prática', () => {
    const a = lessonAchievements(NODES, { path: path('v1', 'q1', 'm1', 'fim'), answers: { m1: { text: '' } } });
    expect(a.practices).toBe(0);
    expect(a.skippedPractices).toBe(1);
    expect(practiceChipLabel(a)).toEqual({ label: 'Prática para depois', done: false });
  });
  it('a palavra "missão" não aparece nos chips da prática (é só da vida real)', () => {
    const feitas = practiceChipLabel({ practices: 2, skippedPractices: 0 });
    const depois = practiceChipLabel({ practices: 0, skippedPractices: 3 });
    expect(feitas).toEqual({ label: '2 práticas feitas', done: true });
    expect(depois).toEqual({ label: '3 práticas para depois', done: false });
    expect(`${feitas?.label} ${depois?.label}`.toLowerCase()).not.toContain('miss');
  });
  it('resposta só com espaços não conta', () => {
    expect(lessonAchievements(NODES, { path: path('m1'), answers: { m1: { text: '   ' } } }).practices).toBe(0);
  });
  it('sem resposta registrada para a atividade visitada, também é "para depois"', () => {
    const a = lessonAchievements(NODES, { path: path('m1'), answers: {} });
    expect(a).toMatchObject({ practices: 0, skippedPractices: 1 });
  });
  it('atividade fora do caminho não conta nem como "para depois"; aula sem atividade não mostra chip', () => {
    const a = lessonAchievements(NODES, { path: path('v1', 'q1', 'fim'), answers: {} });
    expect(a).toMatchObject({ practices: 0, skippedPractices: 0 });
    expect(practiceChipLabel(a)).toBeNull();
    expect(realLifeChipLabel(a)).toBeNull();
  });
  it('a revisão conta uma vez quando há verificação no caminho', () => {
    expect(lessonAchievements(NODES, { path: path('a1'), answers: {} }).reviews).toBe(1);
  });
});

describe('chip da missão "Leve para a vida real"', () => {
  it('"Já experimentei" vira "Vida real: já experimentei" (tom de feito), sem mexer no chip da prática', () => {
    const a = lessonAchievements(NODES, { path: path('v1', 'm1', 'vida', 'fim'), answers: { m1: { text: 'Oi!' }, vida: { missionStatus: 'done', text: 'Deu certo.' } } });
    expect(a.realLife).toBe('done');
    expect(realLifeChipLabel(a)).toEqual({ label: 'Vida real: já experimentei', done: true });
    expect(practiceChipLabel(a)).toEqual({ label: 'Prática feita', done: true });
  });
  it('"Vou fazer depois" vira "Vida real: para depois" (tom neutro)', () => {
    const a = lessonAchievements(NODES, { path: path('v1', 'vida', 'fim'), answers: { vida: { missionStatus: 'later' } } });
    expect(realLifeChipLabel(a)).toEqual({ label: 'Vida real: para depois', done: false });
  });
  it('missão visitada sem estado registrado também é "para depois"; missão fora do caminho não gera chip', () => {
    expect(realLifeChipLabel(lessonAchievements(NODES, { path: path('vida'), answers: {} }))).toEqual({ label: 'Vida real: para depois', done: false });
    expect(realLifeChipLabel(lessonAchievements(NODES, { path: path('v1', 'fim'), answers: { vida: { missionStatus: 'done' } } }))).toBeNull();
  });
  it('a missão não entra na conta da prática nem das decisões', () => {
    const a = lessonAchievements(NODES, { path: path('vida'), answers: { vida: { missionStatus: 'done', text: 'percebi isso' } } });
    expect(a).toMatchObject({ choices: 0, practices: 0, skippedPractices: 0 });
  });

  it('o status que o servidor deixou valendo manda sobre a tentativa (não rebaixa "Já experimentei")', () => {
    const st = { path: path('v1', 'vida', 'fim'), answers: { vida: { missionStatus: 'later' } } };
    expect(lessonAchievements(NODES, st).realLife).toBe('later'); // só a tentativa: "para depois"
    const a = lessonAchievements(NODES, st, { vida: 'done' }); // o servidor manteve "feita"
    expect(a.realLife).toBe('done');
    expect(realLifeChipLabel(a)).toEqual({ label: 'Vida real: já experimentei', done: true });
    expect(lessonAchievements(NODES, { path: path('v1', 'vida', 'fim'), answers: { vida: { missionStatus: 'done' } } }, { vida: 'later' }).realLife).toBe('later');
  });
});
