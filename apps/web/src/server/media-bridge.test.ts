import { describe, expect, it } from 'vitest';
import { allLessons, CALL_SHOT_ID, markdownToCourseDocument, parseMarkdownCourse } from '@lms/course-schema';
import { mediaConfigFromEnv } from '@lms/media';
import { directedPartialReuse, resolveSceneProduction, sceneRequestFromPresentation } from './media';

/* Vídeo dirigido antes de uma decisão com "Chamada:": o vídeo já pago não tinha o plano da chamada. */
const MD = `# Curso ponte

Ideia: Testar a chamada.
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
| Escolha | Qualidade | Feedback | Destino |
|---|---|---|---|
| "Coloco, sim." | forte | É uma responsabilidade real. | FIM |
| "Não coloco." | fraca | Experiência conta. | FIM |

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

type Shots = Array<{ id: string; line: string; layout?: string; cameraId?: string }>;

describe('orçamento: reaproveitamento parcial de cena dirigida (chamada acrescentada)', () => {
  const now = resolveSceneProduction(doc, sceneRequestFromPresentation(doc, lesson.id, 'v01'), cfg, env);
  const shots = (now.jobInput.direction as { shots: Shots }).shots;
  // o vídeo já pago: a mesma cena sem o plano final da chamada
  const prevInput = { ...now.jobInput, direction: { ...(now.jobInput.direction as object), shots: shots.filter((s) => s.id !== CALL_SHOT_ID) } };
  const prev = { jobId: 'mjb_old', input: prevInput, adapterVersion: now.adapterVersion, simulated: false };

  it('cobra só a tomada que ganhou a chamada (o plano final na mesma câmera passa a fazer parte do mesmo clipe contínuo)', () => {
    expect(shots.at(-1)?.id).toBe(CALL_SHOT_ID);
    const p = directedPartialReuse(prev, now, false)!;
    // a chamada fica na câmera do plano anterior: os dois formam UMA tomada (um pedido ao HeyGen); as demais tomadas são reaproveitadas
    expect(shots.at(-1)!.cameraId).toBe(shots.at(-2)!.cameraId);
    expect(p).toMatchObject({ fromJobId: 'mjb_old', reusedShots: shots.length - 2, newShots: 2 });
    expect(p.chars).toBe(`${shots.at(-2)!.line} Agora é com você: o campeonato do bairro entra no currículo?`.length);
    expect(p.estimatedUsd).toBeGreaterThan(0);
    expect(p.estimatedUsd).toBeLessThan(now.estimate.estimatedUsd);
  });

  it('na dúvida, custo cheio: voz, apresentação ou adaptador diferentes, plano novo curto demais ou nada em comum', () => {
    expect(directedPartialReuse({ ...prev, input: { ...prevInput, voiceId: 'outra' } }, now, false)).toBeNull();
    expect(directedPartialReuse({ ...prev, input: { ...prevInput, presentationFingerprint: 'x' } }, now, false)).toBeNull();
    // plano novo numa câmera que o vídeo não usava: compara a impressão restrita às câmeras dos planos pagos
    expect(directedPartialReuse({ ...prev, input: { ...prevInput, presentationFingerprint: 'antes' } }, now, false, 'antes')?.newShots).toBe(2);
    expect(directedPartialReuse({ ...prev, adapterVersion: 'v0' }, now, false)).toBeNull();
    expect(directedPartialReuse({ ...prev, simulated: true }, now, false)).toBeNull();
    const short = { ...now, jobInput: { ...now.jobInput, direction: { shots: [...shots.slice(0, -1), { ...shots.at(-1)!, line: 'Sua vez.', cameraId: 'cam_34' }] } } };
    expect(directedPartialReuse(prev, short, false)).toBeNull();
    expect(directedPartialReuse({ ...prev, input: { ...prevInput, direction: { shots: [{ id: 's1', line: 'Outra fala qualquer aqui.' }] } } }, now, false)).toBeNull();
  });
});
