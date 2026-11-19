'use client';
import { useRef, useState } from 'react';
import { formatCnpj, type CertificateIssuer } from '@lms/course-schema';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox, Field, Input, fieldHintId } from '@/components/ui/input';

type Msg = { kind: 'ok' | 'error'; text: string } | null;

async function uploadImage(file: File): Promise<{ assetId: string; url: string }> {
  const body = new FormData();
  body.set('file', file);
  return api('/api/workspace/certificate-images', { method: 'POST', body });
}

function ImageField({ id, label, hint, assetId, onChange, onError }: { id: string; label: string; hint: string; assetId?: string; onChange: (assetId: string | undefined) => void; onError: (m: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const r = await uploadImage(file);
      onChange(r.assetId);
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Não foi possível enviar a imagem.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <div className="flex flex-wrap items-center gap-4">
        {assetId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/assets/${assetId}`} alt={`Prévia: ${label}`} className="max-h-20 max-w-48 rounded-lg border border-line-strong bg-white object-contain p-2" />
        ) : (
          <span className="text-sm text-fg-muted">Nenhuma imagem</span>
        )}
        <input ref={input} id={id} type="file" accept="image/png,image/jpeg" className="sr-only" aria-describedby={fieldHintId(id)} onChange={(e) => pick(e.target.files?.[0])} />
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Enviando…' : assetId ? 'Trocar imagem' : 'Enviar imagem'}
        </Button>
        {assetId && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => onChange(undefined)} aria-label={`Remover ${label.toLowerCase()}`}>
            Remover
          </Button>
        )}
      </div>
    </Field>
  );
}

export function IssuerForm({ initial, brandName }: { initial: CertificateIssuer; brandName: string }) {
  const [v, setV] = useState<CertificateIssuer>(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const set = <K extends keyof CertificateIssuer>(k: K, val: CertificateIssuer[K]) => {
    setV((p) => ({ ...p, [k]: val }));
    setMsg(null);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const r = await api<{ issuer: CertificateIssuer }>('/api/workspace/certificate-issuer', { method: 'PUT', json: { issuer: v } });
      setV(r.issuer);
      setMsg({ kind: 'ok', text: 'Emissor salvo. Vale para os próximos certificados emitidos.' });
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof ApiError ? err.message : 'Não foi possível salvar.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="max-w-3xl" noValidate>
      <Card className="space-y-6">
        <Field label="Instituição emissora" htmlFor="cert-institution" hint="Se ficar vazio, o certificado usa o nome da plataforma.">
          <Input id="cert-institution" aria-describedby={fieldHintId('cert-institution')} value={v.institution} maxLength={120} placeholder={brandName} onChange={(e) => set('institution', e.target.value)} />
        </Field>
        <Field label="CNPJ" htmlFor="cert-cnpj" hint="Opcional. Aparece no certificado quando preenchido.">
          <Input id="cert-cnpj" aria-describedby={fieldHintId('cert-cnpj')} inputMode="numeric" autoComplete="off" value={v.cnpj} maxLength={18} placeholder="00.000.000/0000-00" onChange={(e) => set('cnpj', formatCnpj(e.target.value))} />
        </Field>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Nome de quem assina" htmlFor="cert-signer-name">
            <Input id="cert-signer-name" value={v.signerName} maxLength={120} autoComplete="off" onChange={(e) => set('signerName', e.target.value)} />
          </Field>
          <Field label="Cargo" htmlFor="cert-signer-role">
            <Input id="cert-signer-role" value={v.signerRole} maxLength={120} autoComplete="off" onChange={(e) => set('signerRole', e.target.value)} />
          </Field>
        </div>
        <ImageField id="cert-logo" label="Logo do emissor" hint="PNG ou JPEG, até 5 MB." assetId={v.logoAssetId} onChange={(a) => set('logoAssetId', a)} onError={(t) => setMsg({ kind: 'error', text: t })} />
        <ImageField id="cert-signature" label="Assinatura" hint="PNG com fundo transparente fica melhor. Até 5 MB." assetId={v.signatureAssetId} onChange={(a) => set('signatureAssetId', a)} onError={(t) => setMsg({ kind: 'error', text: t })} />
        <label className="flex min-h-11 items-center gap-3 text-sm text-fg">
          <Checkbox checked={v.showPlatformBrand} onChange={(e) => set('showPlatformBrand', e.target.checked)} />
          <span>Mostrar a marca {brandName} no certificado</span>
        </label>
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Salvar emissor'}</Button>
          <div className="text-sm" aria-live="polite">
            {msg?.kind === 'ok' && <p role="status" className="text-success">{msg.text}</p>}
            {msg?.kind === 'error' && <p role="alert" className="text-danger">{msg.text}</p>}
          </div>
        </div>
      </Card>
    </form>
  );
}
