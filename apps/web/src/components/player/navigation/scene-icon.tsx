import { BookOpen, Flag, ListChecks, MessageCircle, PenLine, Split, Video, CornerDownRight, type LucideIcon } from 'lucide-react';
import { NODE_TYPE_LABELS, type AnyNode } from '@lms/course-schema';

const ICONS: Record<string, LucideIcon> = {
  scenario: MessageCircle,
  content: BookOpen,
  choice: Split,
  consequence: CornerDownRight,
  reflection: PenLine,
  assessment: ListChecks,
  end: Flag,
};

/** A cena tem vídeo? (sem importar o player: este módulo também roda em páginas do servidor) */
function hasVideo(node: AnyNode): boolean {
  return (node.type === 'scenario' || node.type === 'content' || node.type === 'choice' || node.type === 'consequence') && node.media?.kind === 'video';
}

/** Ícone e rótulo de uma cena: vídeo quando há vídeo; senão, o tipo. */
export function sceneKind(node: AnyNode | undefined): { Icon: LucideIcon; label: string; video: boolean } {
  if (!node) return { Icon: BookOpen, label: 'Cena', video: false };
  const video = hasVideo(node);
  const type = (NODE_TYPE_LABELS as Record<string, string>)[node.type] ?? 'Cena';
  return { Icon: video ? Video : (ICONS[node.type] ?? BookOpen), label: video ? `Vídeo · ${type}` : type, video };
}

export function sceneName(node: AnyNode | undefined, fallback = 'Cena'): string {
  return node?.title?.trim() || (node ? ((NODE_TYPE_LABELS as Record<string, string>)[node.type] ?? fallback) : fallback);
}
