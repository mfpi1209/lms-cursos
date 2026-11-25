'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox, Input, Label } from '@/components/ui/input';

export interface CourseOption { id: string; title: string }

/** Cadastro de pessoa, com a inscrição nos cursos publicados já na mesma tela. */
export function PersonForm({ courses }: { courses: CourseOption[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ userId: string; name: string; email: string; password?: string; enrolled: number } | null>(null);

  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ userId: string; name: string; email: string; password?: string }>('/api/workspace/students', { json: { name, email, ...(password ? { password } : {}) } });
      let enrolled = 0;
      if (selected.size > 0) {
        const res = await api<{ enrollments: unknown[] }>(`/api/workspace/students/${created.userId}/enrollments`, { json: { courseIds: [...selected] } });
        enrolled = res.enrollments.length;
      }
      setDone({ ...created, enrolled });
      setName(''); setEmail(''); setPassword(''); setSelected(new Set());
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao cadastrar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel space-y-5 p-5 sm:p-6" onSubmit={submit} data-testid="person-form">
      <h2 className="text-xl">Cadastrar pessoa</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="person-name">Nome</Label>
          <Input id="person-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoComplete="off" data-testid="person-name" />
        </div>
        <div>
          <Label htmlFor="person-email">E-mail</Label>
          <Input id="person-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} autoComplete="off" data-testid="person-email" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="person-password">Senha inicial <span className="font-normal text-fg-faint">(opcional: se vazia, o sistema gera uma)</span></Label>
          <Input id="person-password" type="text" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} maxLength={200} autoComplete="off" />
        </div>
      </div>
      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-medium text-fg">Inscrever nos cursos</legend>
        {courses.length === 0 ? (
          <p className="text-sm text-fg-muted">Nenhum curso publicado ainda.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {courses.map((c) => (
              <li key={c.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line px-3 py-2 text-sm hover:border-fg/40">
                  <Checkbox checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                  <span className="min-w-0 truncate">{c.title}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy} data-testid="person-submit">{busy ? 'Cadastrando…' : 'Cadastrar pessoa'}</Button>
        {courses.length > 0 && (
          <Button type="button" variant="secondary" onClick={() => setSelected(selected.size === courses.length ? new Set() : new Set(courses.map((c) => c.id)))}>
            {selected.size === courses.length ? 'Limpar seleção' : 'Selecionar todos'}
          </Button>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {done && (
        <div role="status" className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-fg" data-testid="person-created">
          <p><strong>{done.name}</strong> cadastrada ({done.email}){done.enrolled > 0 ? ` e inscrita em ${done.enrolled} ${done.enrolled === 1 ? 'curso' : 'cursos'}` : ''}.</p>
          {done.password && <p className="mt-1">Senha inicial: <code className="select-all font-mono">{done.password}</code> — anote agora, ela não será exibida de novo.</p>}
          <Link href={`/estudio/pessoas/${done.userId}`} className="mt-1 inline-block underline">Abrir página da pessoa</Link>
        </div>
      )}
    </form>
  );
}
