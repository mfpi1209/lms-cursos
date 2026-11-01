import { useId } from 'react';

/**
 * Selo DNA Work de uma trilha: medalhão em SVG feito para a marca.
 *
 * Construção (viewBox 240): borda entalhada laranja (pontos de uma serrilha fina), disco laranja com o nome da
 * trilha (em cima) e "SELO DNA WORK" (embaixo) em texto sobre caminho circular, ponto marinho nas laterais, anel
 * interno com marcas laranja e, no centro, um disco marinho com o monograma "DW" do logo oficial (recortado de
 * `logo-branco.png`, nunca redesenhado).
 *
 * Em tamanhos pequenos (< 120 px) o texto circular ficaria ilegível: a versão compacta mostra só o disco laranja,
 * o disco marinho e o monograma. O texto acessível é sempre o `aria-label` (role="img").
 *
 * - `tone="light"`: para fundo claro (papel, cartão). `tone="dark"`: para fundo marinho (ganha um filete claro por fora).
 * - Componente de servidor, sem estado; ids únicos por instância (várias na mesma página).
 */
export function TrailSeal({
  trail,
  size = 160,
  tone = 'light',
  logoSrc = '/brand/dnawork/logo-branco.png',
  className,
  label,
}: {
  trail: string;
  size?: number;
  tone?: 'light' | 'dark';
  /** logo branco da marca (o monograma é recortado dele) */
  logoSrc?: string;
  className?: string;
  /** texto acessível; padrão: "Selo DNA Work · <trilha>" */
  label?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const NAVY = '#1D1E4C';
  const ORANGE = '#FF7A08';
  const compact = size < 120;
  const full = !compact;
  const aria = label ?? `Selo DNA Work · ${trail}`;

  const r1 = 76; // base do texto de cima (letras crescem para fora)
  const r2 = 87.5; // base do texto de baixo (letras crescem para dentro)
  const fs = Math.min(17, 190 / (Math.max(trail.length, 8) * 0.6));
  const top = `M ${120 - r1} 120 A ${r1} ${r1} 0 0 1 ${120 + r1} 120`;
  const bottom = `M ${120 - r2} 120 A ${r2} ${r2} 0 0 0 ${120 + r2} 120`;
  const markW = compact ? 104 : 68;
  const markH = (markW * 164) / 390;

  return (
    <svg
      role="img"
      aria-label={aria}
      viewBox="0 0 240 240"
      width={size}
      height={size}
      className={className}
      style={{ display: 'block', flex: 'none', fontFamily: 'var(--font-platform), system-ui, sans-serif' }}
    >
      <defs>
        <linearGradient id={`${uid}g`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#FF8E2B" />
          <stop offset="1" stopColor="#F26F00" />
        </linearGradient>
        <path id={`${uid}t`} d={top} />
        <path id={`${uid}b`} d={bottom} />
      </defs>

      {tone === 'dark' && <circle cx="120" cy="120" r="118.5" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="1.2" />}
      {/* borda entalhada: 72 dentes */}
      <circle cx="120" cy="120" r="114" fill="none" stroke={ORANGE} strokeWidth="7" pathLength="720" strokeDasharray="6 4" />
      <circle cx="120" cy="120" r="110.5" fill={`url(#${uid}g)`} />

      {full && (
        <>
          <circle cx="120" cy="120" r="103" fill="none" stroke={NAVY} strokeOpacity=".55" strokeWidth="1.2" />
          <circle cx="120" cy="120" r="66" fill="none" stroke={NAVY} strokeOpacity=".55" strokeWidth="1.2" />
          <text fontSize={fs} fontWeight="800" fill={NAVY} letterSpacing=".3" textAnchor="middle">
            <textPath href={`#${uid}t`} startOffset="50%">{trail}</textPath>
          </text>
          <text fontSize="12.5" fontWeight="800" fill={NAVY} letterSpacing="2.6" textAnchor="middle">
            <textPath href={`#${uid}b`} startOffset="50%">SELO DNA WORK</textPath>
          </text>
          <circle cx="37" cy="120" r="2.6" fill={NAVY} />
          <circle cx="203" cy="120" r="2.6" fill={NAVY} />
        </>
      )}

      {/* disco marinho do centro */}
      <circle cx="120" cy="120" r={compact ? 82 : 62} fill={NAVY} />
      {full && <circle cx="120" cy="120" r="57.5" fill="none" stroke={ORANGE} strokeWidth="3" pathLength="120" strokeDasharray="1.1 3.9" />}
      {compact && <circle cx="120" cy="120" r="76" fill="none" stroke={ORANGE} strokeOpacity=".9" strokeWidth="1.6" />}

      {/* monograma do logo oficial: recorte da imagem (x 12–402, y 46–210 de 1035×260) */}
      <svg x={120 - markW / 2} y={120 - markH / 2} width={markW} height={markH} viewBox="12 46 390 164" aria-hidden="true">
        <image href={logoSrc} width="1035" height="260" />
      </svg>
    </svg>
  );
}
