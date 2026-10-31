import { CourseOverview } from './course-overview';

export const metadata = { title: 'Detalhes do curso' };
export const dynamic = 'force-dynamic';

/** Modo avançado: edição direta de briefing, objetivos, módulos e pendências. */
export default async function CourseDetailsPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  return <CourseOverview courseId={courseId} />;
}
