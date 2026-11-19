import type { CourseMaterial, Module } from '@lms/course-schema';
import { MaterialRow } from '@/components/materials/material-row';

/**
 * Seção "Materiais de apoio" da página do curso: primeiro os do curso inteiro, depois um grupo por módulo (na ordem
 * dos módulos). Sem materiais, não aparece.
 */
export function CourseMaterials({ materials, modules }: { materials: readonly CourseMaterial[]; modules: readonly Pick<Module, 'id' | 'title'>[] }) {
  if (!materials.length) return null;
  const general = materials.filter((m) => !m.moduleId || !modules.some((mod) => mod.id === m.moduleId));
  const groups = modules.map((mod, i) => ({ mod, index: i + 1, items: materials.filter((m) => m.moduleId === mod.id) })).filter((g) => g.items.length);
  return (
    <section id="materiais" aria-labelledby="materials-heading" className="scroll-mt-6 space-y-4" data-testid="course-materials">
      <div>
        <h2 id="materials-heading" className="text-[28px] leading-tight text-fg sm:text-[32px]">
          Materiais de apoio
        </h2>
        <p className="mt-1 text-[15px] text-fg-muted">Resumos, checklists, modelos e infográficos para baixar, imprimir e usar no dia a dia.</p>
      </div>
      <div className="space-y-3">
        {general.length > 0 && (
          <div className="rounded-[18px] border border-line bg-surface px-2 py-2 sm:px-3">
            <h3 className="px-2 pt-2 text-[13px]! font-semibold! leading-[18px]! text-fg-muted sm:px-3">Do curso todo</h3>
            <ul className="divide-y divide-line">{general.map((m) => <MaterialRow key={m.id} m={m} />)}</ul>
          </div>
        )}
        {groups.map((g) => (
          <div key={g.mod.id} className="rounded-[18px] border border-line bg-surface px-2 py-2 sm:px-3">
            <h3 className="px-2 pt-2 text-[13px]! font-semibold! leading-[18px]! text-fg-muted sm:px-3">
              Módulo {g.index} · {g.mod.title}
            </h3>
            <ul className="divide-y divide-line">{g.items.map((m) => <MaterialRow key={m.id} m={m} />)}</ul>
          </div>
        ))}
      </div>
    </section>
  );
}
