import { describe, expect, it } from 'vitest';
import { summarize, type QuoteLine } from './orcamento-calc';

const L = (p: Partial<QuoteLine>): QuoteLine => ({ lessonId: 'l', nodeId: 'n', title: 't', kind: 'avatar', reaction: false, seconds: 60, chars: 900, usd: 1, reused: false, ...p });

describe('orcamento-calc summarize', () => {
  it('separa avatar, tela, reações e reaproveitadas', () => {
    const t = summarize([L({}), L({ kind: 'screen', usd: 0.25, seconds: 30 }), L({ reaction: true, usd: 0.5, seconds: 30 }), L({ reused: true, usd: 0 })]);
    expect(t.avatar).toEqual({ scenes: 2, minutes: 1.5, usd: 1.5 });
    expect(t.screen).toEqual({ scenes: 1, minutes: 0.5, usd: 0.25 });
    expect(t.reactions).toEqual({ scenes: 1, minutes: 0.5, usd: 0.5 });
    expect(t.reused).toEqual({ scenes: 1, minutes: 1 });
    expect(t.totalUsd).toBe(1.75);
  });
});
