'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/input';

/** Inscreve a pessoa nos cursos publicados em que ela ainda não está. */
export function EnrollCourses({ userId, courses }: { userId: string; courses: Array<{ id: string; title: string; trail: string | null }> }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (courses.length === 0) return <p className="text-sm text-fg-muted">Esta pessoa já está inscrita em todos os cursos publicados.</p>;
  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const label = selected.size === 0 ? 'Inscrever' : `Inscrever em ${selected.size} ${selected.size === 1 ? 'curso' : 'cursos'}`;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api(`/api/workspace/students/${userId}/enrollments`, { json: { courseIds: [...selected] } });
          setSelected(new Set());
          router.refresh();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'Erro ao inscrever');
        } finally {
          setBusy(false);
        }
      }}
    >
      <ul className="grid gap-2 sm:grid-cols-2">
        {courses.map((c) => (
          <li key={c.id}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line px-3 py-2 text-sm hover:border-fg/40">
              <Checkbox checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
              <span className="min-w-0"><span className="block truncate">{c.title}</span>{c.trail && <span className="block truncate text-xs text-fg-faint">{c.trail}</span>}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || selected.size === 0} data-testid="enroll-courses-submit">{busy ? 'Inscrevendo…' : label}</Button>
        <Button type="button" variant="secondary" onClick={() => setSelected(selected.size === courses.length ? new Set() : new Set(courses.map((c) => c.id)))}>
          {selected.size === courses.length ? 'Limpar seleção' : 'Selecionar todos'}
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </form>
  );
}
