import { describe, expect, it } from 'vitest';
import { allLessons, markdownToCourseDocument, parseMarkdownCourse, reactionTargetId, type ChoiceNode } from '@lms/course-schema';
import { mediaConfigFromEnv } from '@lms/media';
import { resolveSceneProduction, sceneRequestFromPresentation } from './media';

/* Decisão com a coluna "Reação": cada resposta vira uma cena de produção de plano único ("q01~a"). */
const MD = `# Curso reação

Ideia: Testar a reação.
Público: iniciantes.
Objetivo final: Ao final, a pessoa responde.
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
Chamada: "Agora é com você: o campeonato do bairro entra no currículo?"
| Escolha | Qualidade | Reação | Feedback | Destino |
|---|---|---|---|---|
| "Coloco, sim." | forte | "Isso mesmo! Organizar campeonato mostra responsabilidade e organização." | É uma responsabilidade real. | FIM |
| "Não coloco." | fraca | "Muita gente pensa assim, mas experiência não depende de salário." | Experiência conta. | FIM |

### FIM — O que você levou
- Experiência não é só emprego.
`;

const cams = [
  { id: 'cam_34', name: '3/4', lookId: 'l34', nativeFraming: 'medium' as const, angle: 'left' as const, status: 'ready' as const, placement: 'full_frame' as const, zone: 'center' as const },
  { id: 'cam_esq', name: 'Esq', lookId: 'lesq', nativeFraming: 'medium' as const, angle: 'front' as const, status: 'ready' as const, placement: 'full_frame' as const, zone: 'left' as const },
  { id: 'cam_dir', name: 'Dir', lookId: 'ldir', nativeFraming: 'medium' as const, angle: 'front' as const, status: 'ready' as const, placement: 'full_frame' as const, zone: 'right' as const },
];
const doc = markdownToCourseDocument(parseMarkdownCourse(MD), { presentation: { avatarId: 'l34', voiceProvider: 'elevenlabs', voiceId: 'v1', cameras: cams } });
const lesson = allLessons(doc)[0]!;
const cfg = mediaConfigFromEnv({ MEDIA_SIMULATION: '0' } as unknown as NodeJS.ProcessEnv);
const env = { PLATFORM_BRAND: 'dnawork' } as unknown as NodeJS.ProcessEnv;

describe('produção da reação da instrutora', () => {
  it('alvo "q01~a": plano único na câmera principal, fala = reação, sem pílulas nem pergunta a seguir, com marca d\'água', () => {
    const target = reactionTargetId('q01', 'a');
    const r = resolveSceneProduction(doc, sceneRequestFromPresentation(doc, lesson.id, target), cfg, env);
    expect(r.nodeId).toBe('q01~a');
    expect(r.script).toBe('Isso mesmo! Organizar campeonato mostra responsabilidade e organização.');
    expect(r.jobInput.direction).toBeUndefined();
    expect(r.jobInput.nextQuestion).toBeUndefined();
    expect(r.jobInput.avatarId).toBe('l34');
    expect((r.jobInput.params as { motionPrompt?: string }).motionPrompt).toBe('smiles broadly, pleased');
    expect(r.jobInput.watermark).toBeDefined();
    expect(r.estimate.narrationSeconds).toBeGreaterThanOrEqual(3);
    expect(r.estimate.narrationSeconds).toBeLessThanOrEqual(10);
    // cada resposta tem a sua cena (hash próprio)
    const b = resolveSceneProduction(doc, sceneRequestFromPresentation(doc, lesson.id, reactionTargetId('q01', 'b')), cfg, env);
    expect(b.sceneHash).not.toBe(r.sceneHash);
  });

  it('opção sem reação ou decisão inexistente: alvo não encontrado', () => {
    const q = lesson.graph.nodes.find((n) => n.id === 'q01') as ChoiceNode;
    expect(q.options).toHaveLength(2);
    expect(() => resolveSceneProduction(doc, sceneRequestFromPresentation(doc, lesson.id, 'q01~z'), cfg, env)).toThrow(/não encontrado/);
    expect(() => resolveSceneProduction(doc, sceneRequestFromPresentation(doc, lesson.id, 'q99~a'), cfg, env)).toThrow(/não encontrado/);
  });
});
