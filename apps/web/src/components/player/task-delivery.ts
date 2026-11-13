'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TASK_FILE_MAX_BYTES, checkTaskLink, type TaskStatus } from '@lms/course-schema';
import { ApiError, api } from '@/lib/api';

/*
 * Entrega de tarefa no lado do aluno: a leitura da entrega da matrícula e o rascunho do envio (link + arquivo opcional).
 * Usado pelo painel da tarefa no player (as duas versões) e pelo cartão "Suas entregas" da página do curso.
 * Toda regra vale no servidor; aqui as conferências só poupam uma ida e volta.
 */

export interface TaskFileView {
  assetId: string;
  name: string | null;
  mimeType: string;
  sizeBytes: number;
}

/** A entrega como o aluno a vê (o mesmo formato de `submissions.TaskRecord`). */
export interface TaskRecordView {
  nodeId: string;
  lessonId: string;
  status: TaskStatus;
  link: string;
  file: TaskFileView | null;
  comment: string | null;
  criteria: Array<{ id: string; label: string; met: boolean }>;
  revision: number;
  submittedAt: string;
  reviewedAt: string | null;
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { submitted: 'Em correção', approved: 'Aprovada', returned: 'Devolvida para ajuste' };

export const TASK_PRIVACY_HINT = 'A equipe que corrige vê seu nome, seu link e seu arquivo. Não envie documentos pessoais nem dados de outras pessoas.';

const MIME_NAME: Record<string, string> = { 'application/pdf': 'PDF', 'image/png': 'PNG', 'image/jpeg': 'JPEG' };

/** "PDF, PNG ou JPEG" */
export function acceptedFileNames(acceptedMime: readonly string[]): string {
  const names = acceptedMime.map((m) => MIME_NAME[m]).filter(Boolean);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} ou ${names[names.length - 1]}`;
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Confere o arquivo escolhido antes de enviar (tamanho e tipo declarado); o servidor confere pelos bytes. */
export function checkChosenFile(file: { size: number; type: string }, acceptedMime: readonly string[]): string | null {
  if (file.size === 0) return 'O arquivo está vazio.';
  if (file.size > TASK_FILE_MAX_BYTES) return 'O arquivo passa de 10 MB.';
  if (file.type && !acceptedMime.includes(file.type)) return `Tipo de arquivo não aceito. Envie ${acceptedFileNames(acceptedMime)}.`;
  return null;
}

/**
 * A entrega desta tarefa na matrícula. `loading` só no LMS (com matrícula); na prévia não há entrega.
 * Depois de um envio feito pelo player, `set` troca o valor sem nova consulta.
 */
export function useTaskRecord(enrollmentId: string | undefined, nodeId: string) {
  const [state, setState] = useState<{ loading: boolean; record: TaskRecordView | null; failed: boolean }>({ loading: !!enrollmentId, record: null, failed: false });
  const reload = useCallback(async () => {
    if (!enrollmentId) return;
    try {
      const res = await api<{ tasks: Record<string, TaskRecordView> }>(`/api/enrollments/${enrollmentId}/tasks`);
      setState({ loading: false, record: res.tasks[nodeId] ?? null, failed: false });
    } catch {
      // sem a leitura, o painel mostra o formulário; o servidor decide o que vale quando o aluno enviar
      setState({ loading: false, record: null, failed: true });
    }
  }, [enrollmentId, nodeId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { ...state, reload, set: (record: TaskRecordView | null) => setState({ loading: false, record, failed: false }) };
}

export interface TaskDraft {
  link: string;
  setLink(v: string): void;
  linkError: string | null;
  file: File | null;
  chooseFile(f: File | null): void;
  fileError: string | null;
  uploading: boolean;
  /** confere o link, envia o arquivo (se houver) e devolve o que vai na entrega; `null` = há erro na tela */
  prepare(): Promise<{ link: string; fileAssetId?: string } | null>;
}

/**
 * Rascunho do envio. `uploadUrl` ausente (prévia do estúdio) = o arquivo não é enviado.
 * O arquivo já enviado é reaproveitado se o aluno tentar de novo sem trocar de arquivo (não gasta o limite de envios).
 */
export function useTaskDraft(opts: { acceptedMime: readonly string[]; initialLink?: string; uploadUrl?: string }): TaskDraft {
  const [link, setLinkState] = useState(opts.initialLink ?? '');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploaded = useRef<{ file: File; assetId: string } | null>(null);

  const setLink = (v: string) => {
    setLinkState(v);
    if (linkError) setLinkError(null);
  };
  const chooseFile = (f: File | null) => {
    setFile(f);
    setFileError(f ? checkChosenFile(f, opts.acceptedMime) : null);
  };
  const prepare = async () => {
    const checked = checkTaskLink(link);
    if (!checked.ok) {
      setLinkError(checked.message);
      return null;
    }
    setLinkError(null);
    if (!file || !opts.acceptedMime.length || !opts.uploadUrl) return { link: checked.link };
    const problem = checkChosenFile(file, opts.acceptedMime);
    if (problem) {
      setFileError(problem);
      return null;
    }
    if (uploaded.current?.file === file) return { link: checked.link, fileAssetId: uploaded.current.assetId };
    setUploading(true);
    setFileError(null);
    try {
      const body = new FormData();
      body.set('file', file);
      const res = await api<{ file: TaskFileView }>(opts.uploadUrl, { method: 'POST', body });
      uploaded.current = { file, assetId: res.file.assetId };
      return { link: checked.link, fileAssetId: res.file.assetId };
    } catch (e) {
      setFileError(e instanceof ApiError ? e.message : 'Não foi possível enviar o arquivo. Confira a conexão e tente de novo.');
      return null;
    } finally {
      setUploading(false);
    }
  };
  return { link, setLink, linkError, file, chooseFile, fileError, uploading, prepare };
}
