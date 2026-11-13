'use client';
import { useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/input';

interface CourseOption {
  slug: string;
  title: string;
  enrollments: number;
}

export function ExportForm({ courses }: { courses: CourseOption[] }) {
  const [slug, setSlug] = useState('');
  const total = slug ? courses.find((c) => c.slug === slug)?.enrollments ?? 0 : courses.reduce((n, c) => n + c.enrollments, 0);
  const href = `/api/workspace/reports/progress${slug ? `?curso=${encodeURIComponent(slug)}` : ''}`;
  return (
    <Card className="max-w-xl space-y-5">
      <div className="max-w-md">
        <Field label="Curso" htmlFor="export-curso" hint="Todos os cursos publicados ou só um. Quando há vários cursos, cada avaliação ganha o nome do curso no cabeçalho.">
          <Select id="export-curso" value={slug} onChange={(e) => setSlug(e.target.value)} data-testid="export-curso">
            <option value="">Todos os cursos</option>
            {courses.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.title}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <p className="text-sm text-fg-muted" data-testid="export-total">
        {total === 0 ? 'Nenhuma matrícula neste filtro: o arquivo terá só o cabeçalho.' : `${total} ${total === 1 ? 'matrícula' : 'matrículas'} neste filtro.`}
      </p>
      <a href={href} download className={buttonVariants({ variant: 'primary' })} data-testid="export-baixar">
        Baixar CSV
      </a>
    </Card>
  );
}
