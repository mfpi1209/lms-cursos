'use client';
import { useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, Badge, type BadgeTone } from '@/components/ui/card';
import { Checkbox, Input, Label } from '@/components/ui/input';
import { CSV_MAX_BYTES, errorsToCsv, parseStudentsCsv, type CsvStudentRow } from '@/lib/alunos-csv';

type Status = 'created' | 'updated' | 'unchanged' | 'error';
interface ResultRow {
  index: number;
  linha: number;
  email: string;
  status: Status;
  reason?: string;
  enrolled: string[];
  alreadyEnrolled: string[];
}
interface ImportResponse {
  dryRun: boolean;
  summary: Record<Status, number> & { total: number };
  results: ResultRow[];
  email?: { transport: string; sent: number; failed: number; skipped: number };
}

const STATUS_LABEL: Record<Status, string> = { created: 'Novo', updated: 'Atualiza', unchanged: 'Sem mudança', error: 'Erro' };
const STATUS_TONE: Record<Status, BadgeTone> = { created: 'success', updated: 'brand', unchanged: 'neutral', error: 'danger' };
const APPLIED_LABEL: Record<Status, string> = { created: 'Criado', updated: 'Atualizado', unchanged: 'Sem mudança', error: 'Erro' };

export function ImportForm({ courses, email }: { courses: Array<{ slug: string; title: string }>; email: { transport: string; delivers: boolean } }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<CsvStudentRow[]>([]);
  const [fatal, setFatal] = useState<string[]>([]);
  const [warn, setWarn] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [applied, setApplied] = useState<ImportResponse | null>(null);
  const [sendLink, setSendLink] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFileName('');
    setRows([]);
    setFatal([]);
    setWarn(null);
    setPreview(null);
    setApplied(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function post(parsed: CsvStudentRow[], dryRun: boolean): Promise<ImportResponse> {
    return api<ImportResponse>('/api/workspace/students/import', { json: { rows: parsed, dryRun, enviarLink: !dryRun && sendLink } });
  }

  async function onFile(file: File | undefined) {
    setPreview(null);
    setApplied(null);
    setError(null);
    setFatal([]);
    setWarn(null);
    setRows([]);
    if (!file) return;
    setFileName(file.name);
    if (file.size > CSV_MAX_BYTES) {
      setFatal([`O arquivo tem ${(file.size / 1024 / 1024).toFixed(1)} MB; o máximo é ${CSV_MAX_BYTES / 1024 / 1024} MB.`]);
      return;
    }
    const text = await file.text();
    const parsed = parseStudentsCsv(text);
    if (parsed.fatal.length) {
      setFatal(parsed.fatal);
      return;
    }
    if (text.includes('�')) setWarn('Alguns caracteres não foram lidos (acentos trocados por �). Salve a planilha como "CSV UTF-8" e envie de novo.');
    setRows(parsed.rows);
    setBusy(true);
    try {
      setPreview(await post(parsed.rows, true));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível conferir o arquivo');
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      setApplied(await post(rows, false));
      setPreview(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível importar');
    } finally {
      setBusy(false);
    }
  }

  function downloadErrors(res: ImportResponse) {
    const items = res.results.filter((r) => r.status === 'error').map((r) => ({ row: rows[r.index]!, reason: r.reason ?? 'Erro' }));
    const url = URL.createObjectURL(new Blob([errorsToCsv(items)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'alunos-com-erro.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const current = applied ?? preview;
  const okCount = preview ? preview.summary.total - preview.summary.error : 0;

  return (
    <div className="space-y-8">
      <Card className="space-y-4">
        <div className="max-w-md">
          <Label htmlFor="csv-file">Arquivo CSV</Label>
          <Input id="csv-file" ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="py-2.5" data-testid="csv-file" disabled={busy} onChange={(e) => void onFile(e.target.files?.[0])} />
        </div>
        {courses.length > 0 && (
          <p className="text-sm text-fg-muted">
            Cursos publicados que podem ir na coluna <code>cursos</code>:{' '}
            {courses.map((c, i) => (
              <span key={c.slug}>
                {i > 0 && ', '}
                <code title={c.title}>{c.slug}</code>
              </span>
            ))}
            .
          </p>
        )}
        {fatal.length > 0 && (
          <ul role="alert" className="space-y-1 text-sm text-danger" data-testid="csv-fatal">
            {fatal.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
        {warn && <p role="status" className="text-sm text-paid">{warn}</p>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {busy && !current && <p role="status" className="text-sm text-fg-muted">Conferindo o arquivo…</p>}
      </Card>

      {current && (
        <section className="space-y-4" aria-labelledby="res-title" data-testid={applied ? 'csv-resultado' : 'csv-previa'}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <h2 id="res-title" className="text-2xl">{applied ? 'Importação concluída' : 'Prévia (nada foi gravado ainda)'}</h2>
              <p className="text-sm text-fg-muted" data-testid="csv-resumo">
                {fileName} · {current.summary.total} linhas · {current.summary.created} {applied ? 'criadas' : 'novas'} · {current.summary.updated} {applied ? 'atualizadas' : 'a atualizar'} · {current.summary.unchanged} sem mudança · {current.summary.error} com erro
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {current.summary.error > 0 && (
                <Button variant="secondary" size="sm" onClick={() => downloadErrors(current)} data-testid="csv-baixar-erros">
                  Baixar linhas com erro (CSV)
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={reset}>{applied ? 'Importar outro arquivo' : 'Cancelar'}</Button>
            </div>
          </div>

          {applied?.email && (
            <p role="status" className="rounded-xl bg-fg/5 px-4 py-3 text-sm" data-testid="csv-email-resumo">
              Links de acesso por e-mail: {applied.email.sent} enviados, {applied.email.failed} com falha, {applied.email.skipped} não enviados (sem novidade ou limite por endereço).
              {applied.email.transport === 'log' && ' O envio de e-mail está em modo de registro (log): nada saiu de verdade.'}
            </p>
          )}

          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="bg-fg/5 text-fg-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Linha</th>
                  <th scope="col" className="px-3 py-2 font-medium">Aluno</th>
                  <th scope="col" className="px-3 py-2 font-medium">RGM</th>
                  <th scope="col" className="px-3 py-2 font-medium">Cursos</th>
                  <th scope="col" className="px-3 py-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {current.results.map((r) => {
                  const src = rows[r.index];
                  return (
                    <tr key={r.index} className="border-t border-line align-top" data-testid="csv-linha" data-status={r.status}>
                      <td className="px-3 py-2 tabular-nums text-fg-muted">{r.linha}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium">{src?.nome || <span className="text-fg-faint">(sem nome)</span>}</p>
                        <p className="text-fg-muted">{r.email || src?.email}</p>
                      </td>
                      <td className="px-3 py-2">{src?.rgm}</td>
                      <td className="px-3 py-2 text-fg-muted">{[...r.enrolled, ...r.alreadyEnrolled].join(', ') || (src?.cursos.join(', ') ?? '')}</td>
                      <td className="px-3 py-2">
                        <Badge tone={STATUS_TONE[r.status]}>{(applied ? APPLIED_LABEL : STATUS_LABEL)[r.status]}</Badge>
                        {r.reason && <p className="mt-1 text-danger">{r.reason}</p>}
                        {!r.reason && r.enrolled.length > 0 && <p className="mt-1 text-fg-muted">{applied ? 'Matriculado em' : 'Será matriculado em'} {r.enrolled.join(', ')}</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {preview && (
            <Card className="space-y-4">
              <label className="flex items-start gap-3 text-sm">
                <Checkbox checked={sendLink} onChange={(e) => setSendLink(e.target.checked)} data-testid="csv-enviar-link" className="mt-0.5" />
                <span>
                  <span className="font-medium">Enviar link de acesso por e-mail</span> a quem for criado ou ganhar matrícula nova.
                  <span className="mt-1 block text-fg-muted" data-testid="csv-email-estado">
                    {email.delivers ? `Envio ativo (${email.transport}).` : 'Envio de e-mail em modo de registro (log): nenhum e-mail sai de verdade. Fica desligado por padrão.'}
                  </span>
                </span>
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => void confirm()} disabled={busy || okCount === 0} data-testid="csv-confirmar">
                  {busy ? 'Importando…' : `Confirmar e importar ${okCount} ${okCount === 1 ? 'aluno' : 'alunos'}`}
                </Button>
                {preview.summary.error > 0 && <span className="text-sm text-fg-muted">As {preview.summary.error} linhas com erro serão puladas.</span>}
              </div>
            </Card>
          )}
        </section>
      )}
    </div>
  );
}
