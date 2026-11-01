import { describe, expect, it } from 'vitest';
import { TRAIL_CREDENTIALS, TRAIL_FINAL_CHECK_MINUTES, competencyNamesFor, credentialFor, cvText, describeCompetencies, formatWorkload, trailWorkload, type TrailCredential } from '../src/trail-credentials';
import { TRAIL_ORDER } from '../src/trails';

const course = (...minutes: number[][]) => ({ modules: minutes.map((m) => ({ lessons: m.map((estimatedMinutes) => ({ estimatedMinutes })) })) });

describe('carga horária da trilha', () => {
  it('soma as aulas de todos os cursos/módulos + o tempo fixo da checagem final', () => {
    expect(TRAIL_FINAL_CHECK_MINUTES).toBe(10);
    expect(trailWorkload([course([5, 4], [3]), course([12])])).toBe(5 + 4 + 3 + 12 + 10);
    expect(trailWorkload([])).toBe(10);
    expect(trailWorkload([course([])])).toBe(10);
  });

  it('ignora durações inválidas em vez de quebrar a soma', () => {
    expect(trailWorkload([course([5, Number.NaN, -3])])).toBe(15);
  });

  it('formata: abaixo de 60 min só minutos; depois "h min"; nunca arredonda para hora cheia', () => {
    expect(formatWorkload(0)).toBe('0 min');
    expect(formatWorkload(45)).toBe('45 min');
    expect(formatWorkload(59)).toBe('59 min');
    expect(formatWorkload(60)).toBe('1 h');
    expect(formatWorkload(61)).toBe('1 h 1 min');
    expect(formatWorkload(90)).toBe('1 h 30 min');
    expect(formatWorkload(135)).toBe('2 h 15 min');
    expect(formatWorkload(122.4)).toBe('2 h 2 min');
  });
});

describe('credenciais curadas por trilha: retorno ao derivado', () => {
  const custom: Record<string, TrailCredential> = {
    convivencia: {
      competencies: [
        { name: 'Combina o que cabe a cada um', description: 'Divide tarefas e avisa quando algo muda.' },
        { name: 'Pede ajuda cedo', description: 'Fala antes que o problema cresça.' },
      ],
      cvSummary: 'Pratica convivência no trabalho.',
      keywords: ['trabalho em equipe'],
    },
    vazia: { competencies: [], cvSummary: '', keywords: [] },
  };

  it('sem conteúdo curado (hoje: nenhuma trilha), usa as competências derivadas', () => {
    expect(credentialFor('Convivência', {})).toBeNull();
    expect(competencyNamesFor('Convivência', ['Pede um exemplo', 'Avisa o atraso'], {})).toEqual(['Pede um exemplo', 'Avisa o atraso']);
    for (const t of TRAIL_ORDER) expect(credentialFor(t, TRAIL_CREDENTIALS) === null || credentialFor(t, TRAIL_CREDENTIALS)!.competencies.length > 0).toBe(true);
  });

  it('entrada sem competências conta como ausente', () => {
    expect(credentialFor('Vazia', custom)).toBeNull();
    expect(competencyNamesFor('Vazia', ['X'], custom)).toEqual(['X']);
  });

  it('com conteúdo curado, o selo novo grava os nomes curados (a chave é o slug da trilha)', () => {
    expect(credentialFor('Convivência', custom)?.cvSummary).toBe('Pratica convivência no trabalho.');
    expect(competencyNamesFor('Convivência', ['derivado'], custom)).toEqual(['Combina o que cabe a cada um', 'Pede ajuda cedo']);
  });

  it('a verificação casa a descrição pelo nome; o que não casa fica só com o texto gravado', () => {
    const out = describeCompetencies('Convivência', ['  pede AJUDA cedo ', 'Texto antigo derivado'], custom);
    expect(out[0]).toEqual({ name: '  pede AJUDA cedo ', description: 'Fala antes que o problema cresça.' });
    expect(out[1]).toEqual({ name: 'Texto antigo derivado', description: '' });
    expect(describeCompetencies('Convivência', ['Pede ajuda cedo'], {})).toEqual([{ name: 'Pede ajuda cedo', description: '' }]);
  });
});

describe('texto para o currículo', () => {
  const base = { trail: 'Convivência', year: 2026, workloadMinutes: 90, competencies: ['A.', 'B', 'C', 'D'], verifyUrl: 'https://x.test/selo/DNA-AAAA-BBBB' };

  it('segue o formato combinado, com até 3 competências', () => {
    expect(cvText(base)).toBe('Selo DNA Work · Convivência — DNA Work, 2026 · Carga horária: 1 h 30 min · Competências: A, B, C · Verificação: https://x.test/selo/DNA-AAAA-BBBB');
  });

  it('com resumo curado, ele vem numa linha acima', () => {
    const t = cvText({ ...base, summary: ' Resumo. ' });
    expect(t.split('\n')).toHaveLength(2);
    expect(t.startsWith('Resumo.\nSelo DNA Work')).toBe(true);
  });
});
