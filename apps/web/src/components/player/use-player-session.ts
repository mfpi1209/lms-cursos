'use client';

import { useCallback, useEffect, useState } from 'react';
import { backAvailability, type AssessmentOutcome, type AttemptState, type Intent, type NavigationTarget, type ProgressSummary } from '@lms/course-engine';
import type { AnyNode, Lesson, MediaRef, RichTextDocument } from '@lms/course-schema';
import { ApiError, newEventId } from '@/lib/api';
import type { PlayerDriver, PlayerStart, PlayerStepResult } from './types';

/**
 * Estado e intenções do player, compartilhados pelos dois visuais (clássico e
 * plataforma). O servidor decide as transições; aqui só guardamos a sessão,
 * enviamos intenções e traduzimos o resultado em painéis de retorno.
 *
 * Idempotência: cada submissão recebe UM eventId, reaproveitado ao tentar de
 * novo após falha de rede. Conflito (409) = outra aba avançou: ressincroniza
 * via driver.start() e avisa sem bloquear.
 */

export interface Session {
  state: AttemptState;
  revision: number;
  progress: ProgressSummary;
  attemptNumber: number;
}

/** Uma submissão = um eventId. Reaproveitada na íntegra ao tentar de novo. */
export interface Submission {
  eventId: string;
  nodeId: string;
  expectedRevision: number;
  intent: Intent;
}

/** Painel mostrado no nó SEGUINTE a uma escolha/avaliação (o motor já transicionou). */
export type Carry =
  | {
      kind: 'choice';
      nodeId: string;
      optionLabel: string;
      feedback?: RichTextDocument;
      /** reação da instrutora à resposta escolhida (vídeo curto tocado antes da cena seguinte; reaction.ts) */
      reaction?: { text: string; media: MediaRef & { captions?: { assetId: string; lang?: string } | null } };
    }
  | { kind: 'assessment'; nodeId: string; outcome: AssessmentOutcome; feedback?: RichTextDocument };

/** Avaliação reprovada com tentativas restantes: o aluno continua no mesmo nó. */
export interface RetryInfo {
  nodeId: string;
  outcome: AssessmentOutcome;
  feedback?: RichTextDocument;
}

/**
 * Resposta aberta (falada/escrita) junto da escolha. O motor ignora campos
 * desconhecidos; outra parte do sistema pode passar a guardá-los.
 */
export interface OpenAnswerPayload {
  text?: string;
  audioAssetId?: string;
}

export type PlayerIntent = Intent | { kind: 'choose'; optionId: string; openAnswer: OpenAnswerPayload };

export function findNode(lesson: Lesson, nodeId: string): AnyNode | undefined {
  return lesson.graph.nodes.find((n) => n.id === nodeId);
}

export function messageOf(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return 'Não foi possível concluir a ação. Verifique sua conexão.';
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function usePlayerSession(lesson: Lesson, driver: PlayerDriver) {
  const [session, setSession] = useState<Session | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [inflight, setInflight] = useState<Submission | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [carry, setCarry] = useState<Carry | null>(null);
  const [retry, setRetry] = useState<RetryInfo | null>(null);
  const [announce, setAnnounce] = useState('');
  /** o aluno já clicou para avançar: o vídeo da próxima cena pode tocar sozinho */
  const [gesture, setGesture] = useState(false);

  const resetTransient = useCallback(() => {
    setInflight(null);
    setStepError(null);
    setFieldError(null);
    setCarry(null);
    setRetry(null);
  }, []);

  const begin = useCallback(
    async (fn: () => Promise<PlayerStart>) => {
      setLoadError(null);
      try {
        const s = await fn();
        setSession(s);
        resetTransient();
        return s;
      } catch (e) {
        setLoadError(messageOf(e));
        return null;
      }
    },
    [resetTransient],
  );

  useEffect(() => {
    let cancelled = false;
    setSession(null);
    setLoadError(null);
    setConflict(false);
    driver
      .start()
      .then((s) => {
        if (cancelled) return;
        setSession(s);
        resetTransient();
      })
      .catch((e) => {
        if (!cancelled) setLoadError(messageOf(e));
      });
    return () => {
      cancelled = true;
    };
  }, [driver, resetTransient]);

  const applyResult = useCallback(
    (sub: Submission, res: PlayerStepResult) => {
      setSession((prev) => ({ state: res.state, revision: res.revision, progress: res.progress, attemptNumber: prev?.attemptNumber ?? 1 }));
      setConflict(false);
      const node = findNode(lesson, sub.nodeId);
      const intent = sub.intent;
      if (intent.kind === 'choose' && node?.type === 'choice') {
        const opt = node.options.find((o) => o.id === intent.optionId);
        const reaction = opt?.reaction?.text && opt.reaction.media?.kind === 'video' ? { text: opt.reaction.text, media: opt.reaction.media } : undefined;
        setCarry({ kind: 'choice', nodeId: res.toNodeId, optionLabel: opt?.label ?? intent.optionId, feedback: res.feedback, ...(reaction ? { reaction } : {}) });
        setRetry(null);
      } else if (intent.kind === 'assess' && res.assessment) {
        if (res.assessment.retry && !res.transitioned) {
          setRetry({ nodeId: sub.nodeId, outcome: res.assessment, feedback: res.feedback });
          setCarry(null);
        } else {
          setCarry({ kind: 'assessment', nodeId: res.toNodeId, outcome: res.assessment, feedback: res.feedback });
          setRetry(null);
        }
      } else {
        setCarry(null);
        setRetry(null);
      }
      // "Continuar"/"Pular vídeo" não registram resposta: só anunciam a próxima cena.
      const nextTitle = res.transitioned ? findNode(lesson, res.toNodeId)?.title?.trim() : undefined;
      const nextCopy = nextTitle ? `Próxima cena: ${nextTitle}${/[.!?…]$/.test(nextTitle) ? '' : '.'}` : 'Próxima cena.';
      setAnnounce(
        res.lessonCompleted ? 'Aula concluída.' : intent.kind === 'advance' ? nextCopy : res.transitioned ? `Resposta registrada. ${nextCopy}` : 'Resposta registrada.',
      );
    },
    [lesson],
  );

  const submit = useCallback(
    async (sub: Submission) => {
      setPending(true);
      setStepError(null);
      setFieldError(null);
      setInflight(sub);
      setAnnounce('Enviando…');
      try {
        const res = await driver.step(sub);
        applyResult(sub, res);
        setInflight(null);
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          // Outra aba avançou (revisão ou nó desatualizado): ressincroniza.
          setInflight(null);
          const s = await begin(() => driver.start());
          if (s) {
            setConflict(true);
            setAnnounce('Esta aula avançou em outra aba. Continuamos do ponto atual.');
          }
        } else if (e instanceof ApiError && e.status === 422) {
          // Regra do motor (ex.: texto curto): o aluno corrige e envia de novo.
          setInflight(null);
          setFieldError(e.message);
          setAnnounce(e.message);
        } else {
          // Falha de rede/servidor: mantém a submissão para reenviar com o MESMO eventId.
          setStepError(messageOf(e));
          setAnnounce('Não foi possível enviar. Tente de novo.');
        }
      } finally {
        setPending(false);
      }
    },
    [driver, applyResult, begin],
  );

  const send = useCallback(
    (intent: PlayerIntent) => {
      if (!session || pending) return;
      setGesture(true);
      // Campos extras (ex.: openAnswer) seguem no corpo; o motor ignora o que não conhece.
      void submit({ eventId: newEventId(), nodeId: session.state.currentNodeId, expectedRevision: session.revision, intent: intent as Intent });
    },
    [session, pending, submit],
  );

  const retrySend = useCallback(() => {
    if (inflight && !pending) void submit(inflight);
  }, [inflight, pending, submit]);

  const restart = useCallback(async (opts: { midway?: boolean } = {}) => {
    const fn = opts.midway ? (driver.restartNow ?? driver.restart) : driver.restart;
    if (!fn || pending) return;
    setPending(true);
    setStepError(null);
    setConflict(false);
    try {
      const s = await fn.call(driver);
      setSession(s);
      resetTransient();
      setAnnounce('Nova tentativa iniciada.');
    } catch (e) {
      setStepError(messageOf(e));
    } finally {
      setPending(false);
    }
  }, [driver, pending, resetTransient]);

  /**
   * "Cena anterior" (sem alvo) ou "Voltar para esta cena" (índice do caminho).
   * O servidor restaura o estado de quando a cena foi aberta; o aluno pode
   * responder de novo. 409 = outra aba mexeu: ressincroniza como nos passos.
   */
  const back = backAvailability(session?.state ?? { status: 'in_progress', path: [] } as unknown as AttemptState, { allowBack: lesson.allowBack });
  const canGoBack = !!session && !!driver.navigate && back.ok;
  const goBack = useCallback(
    async (pathIndex?: number) => {
      if (!session || !driver.navigate || pending) return false;
      const target: NavigationTarget = pathIndex === undefined ? { kind: 'back' } : { kind: 'goto', pathIndex, nodeId: session.state.path[pathIndex]?.nodeId };
      setPending(true);
      setStepError(null);
      setFieldError(null);
      setGesture(true);
      setAnnounce('Voltando…');
      try {
        const res = await driver.navigate({ nodeId: session.state.currentNodeId, expectedRevision: session.revision, target, eventId: newEventId() });
        setSession((prev) => ({ state: res.state, revision: res.revision, progress: res.progress, attemptNumber: prev?.attemptNumber ?? 1 }));
        resetTransient();
        setConflict(false);
        const title = findNode(lesson, res.toNodeId)?.title?.trim();
        setAnnounce(title ? `Você voltou para a cena: ${title}. Pode responder de novo.` : 'Você voltou uma cena. Pode responder de novo.');
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          const s = await begin(() => driver.start());
          if (s) {
            setConflict(true);
            setAnnounce('Esta aula avançou em outra aba. Continuamos do ponto atual.');
          }
        } else {
          setStepError(messageOf(e));
          setAnnounce('Não foi possível voltar. Tente de novo.');
        }
        return false;
      } finally {
        setPending(false);
      }
    },
    [session, driver, pending, lesson, resetTransient, begin],
  );

  return {
    session,
    loadError,
    pending,
    /** voltar cenas está disponível agora (aula em andamento, não é a primeira cena, aula permite) */
    canGoBack,
    /** por que não dá para voltar (aula concluída, aula estrita, primeira cena) */
    backBlocked: back.ok ? null : back,
    goBack,
    inflight,
    stepError,
    fieldError,
    conflict,
    setConflict,
    carry,
    retry,
    announce,
    gesture,
    begin,
    send,
    retrySend,
    restart,
  };
}

export type PlayerSession = ReturnType<typeof usePlayerSession>;
