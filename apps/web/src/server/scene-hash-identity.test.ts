import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CourseDocument } from '@lms/course-schema';
import { mediaConfigFromEnv } from '@lms/media';
import * as compose from '@lms/media/compose';
import * as timing from '@lms/media/timing';
import { resolveSceneProduction, sceneRequestFromPresentation } from './media';

/**
 * Trava de custo: a revisão "Assistir e marcar" reaproveita código compartilhado (tomadas, agenda das telas e do painel)
 * e NÃO pode mudar o hash de nenhuma cena (hash diferente = o curso inteiro seria gerado e cobrado de novo). O fixture é
 * o módulo 1 do C1 com os `sceneHash` que o worker gravou na geração (cena dirigida com painel, tela simulada e decisão).
 */
const fx = JSON.parse(readFileSync(path.join(__dirname, '__fixtures__/c1-modulo1-hash.json'), 'utf8')) as { env: Record<string, string>; expected: Record<string, string>; doc: CourseDocument };

describe('hash das cenas do C1 (idêntico ao gravado na geração)', () => {
  const cfg = { ...mediaConfigFromEnv(fx.env as NodeJS.ProcessEnv), simulation: false };
  for (const [key, hash] of Object.entries(fx.expected)) {
    it(key, () => {
      const [lessonId, nodeId] = key.split('/') as [string, string];
      expect(resolveSceneProduction(fx.doc, sceneRequestFromPresentation(fx.doc, lessonId, nodeId), cfg, {} as NodeJS.ProcessEnv).sceneHash).toBe(hash);
    });
  }

  it('a revisão usa as MESMAS funções de tempo da montagem (não cópias)', () => {
    expect(timing.scheduleZonePanel).toBe(compose.scheduleZonePanel);
    expect(timing.splitMockDurations).toBe(compose.splitMockDurations);
    expect(timing.planSceneScreens).toBe(compose.planSceneScreens);
    expect(timing.parseWebVtt).toBe(compose.parseWebVtt);
  });
});
