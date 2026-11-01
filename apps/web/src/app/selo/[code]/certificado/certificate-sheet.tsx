import { TrailSeal } from '@/components/trail-seal';

export interface CertificateData {
  brandName: string;
  /** logo branco (fundo marinho); sem logo, a marca vai em texto */
  logoDark?: string;
  logoRatio?: number;
  holderName: string;
  trailName: string;
  code: string;
  courseCount: number;
  courses: string[];
  competencies: Array<{ name: string; description: string }>;
  issuedOn: string;
  workload: string;
  /** endereço de verificação completo e a forma curta que aparece no papel */
  verifyUrl: string;
  verifyShort: string;
  /** SVG do QR (gerado no servidor) */
  qrSvg: string;
}

/** Pincelada laranja sob o título manuscrito: o mesmo traço do `Swoosh` das capas (course-tile). */
function Swoosh() {
  return (
    <svg viewBox="0 0 200 18" preserveAspectRatio="none" aria-hidden="true" className="cert-swoosh">
      <path d="M3 12c38-6 92-9 194-5" fill="none" stroke="#FF7A08" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

const nameSize = (n: string) => (n.length > 34 ? 'xl' : n.length > 24 ? 'l' : n.length > 17 ? 'm' : 's');

/**
 * Folha do certificado (A4 paisagem): faixa marinho à esquerda (logo, selo, código, QR) e papel branco à direita
 * (titular, trilha em letra manuscrita com a pincelada laranja, competências com descrição, cursos e dados).
 * Texto sempre real. As medidas da folha são em `cqw` (ver CERT_CSS).
 */
export function CertificateSheet({ d }: { d: CertificateData }) {
  const { competencies } = d;
  return (
    <div className="cert-wrap">
      <article className="cert-sheet" aria-labelledby="cert-title" data-testid="certificate">
        <aside className="cert-band">
          <div className="cert-band-logo">
            {d.logoDark ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.logoDark} alt={d.brandName} width={Math.round(34 * (d.logoRatio ?? 4))} height={34} />
            ) : (
              <span className="cert-band-wordmark">{d.brandName}</span>
            )}
          </div>

          <div className="cert-band-seal">
            <TrailSeal trail={d.trailName} size={240} tone="dark" className="cert-sealsvg" />
            <p className="cert-band-code">
              Código
              <span>{d.code}</span>
            </p>
          </div>

          <div className="cert-verify">
            <div className="cert-qr" role="img" aria-label={`QR code que leva à verificação do selo ${d.code}: ${d.verifyUrl}`} dangerouslySetInnerHTML={{ __html: d.qrSvg }} />
            <p>
              <strong>Confira a validade</strong>
              <a href={d.verifyUrl}>{d.verifyShort}</a>
            </p>
          </div>
        </aside>

        <div className="cert-body" data-dense={competencies.length >= 5 ? 'true' : undefined}>
          <h1 id="cert-title" className="cert-kicker">Certificado de conclusão</h1>

          <p className="cert-name" data-size={nameSize(d.holderName)} data-testid="certificate-holder">{d.holderName}</p>
          <p className="cert-lead">concluiu a trilha</p>
          <p className="cert-trail">
            <span>{d.trailName}</span>
            <Swoosh />
          </p>
          <p className="cert-what">
            Para chegar aqui, concluiu {d.courseCount === 1 ? 'o curso' : `os ${d.courseCount} cursos`} da trilha, registrou as atividades práticas de cada curso e passou na checagem final com situações de trabalho.
          </p>

          <section className="cert-comps" aria-labelledby="cert-comp" data-count={competencies.length}>
            <h2 id="cert-comp">Competências demonstradas</h2>
            <ul>
              {competencies.map((c) => (
                <li key={c.name}>
                  <strong>{c.name}</strong>
                  {c.description && <span>{c.description}</span>}
                </li>
              ))}
            </ul>
          </section>

          <section className="cert-courses" aria-labelledby="cert-courses">
            <h2 id="cert-courses">Cursos da trilha</h2>
            <ul>
              {d.courses.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </section>

          <dl className="cert-foot">
            <div>
              <dt>Emitido em</dt>
              <dd>{d.issuedOn}</dd>
            </div>
            <div>
              <dt>Carga horária</dt>
              <dd data-testid="certificate-workload">{d.workload}</dd>
            </div>
          </dl>
        </div>
      </article>
    </div>
  );
}

/**
 * Folha A4 paisagem. Cores sempre claras (marca DNA Work), também na impressão.
 *
 * Tela larga e impressão: tudo em `cqw` (1% da largura da folha), então a folha encolhe sem perder proporção.
 * Abaixo de 880 px de largura (celular) a folha deixa de ser um A4 em miniatura (o texto cairia para ~5 px):
 * vira uma ficha empilhada, com a faixa marinho em cima e a mesma ordem de leitura. O QR some nessa tela (quem
 * está no celular já tem o link ao lado). Na impressão a folha tem 297 mm, então sempre usa o desenho largo.
 */
export const CERT_CSS = `
@page { size: A4 landscape; margin: 0; }
.cert-page { --t-bg: #F4F7FA !important; --t-bg-2: #fff !important; --t-surface: #fff !important; --t-fg: #1D1E4C !important; --t-fg-muted: #4a4d6e !important; --t-fg-faint: #5c5f80 !important; --t-line: #d8dce8 !important; --t-line-strong: #8a8da6 !important; --t-accent: #A84C00 !important; --t-accent-fill: #FF7A08 !important; --t-accent-fill-fg: #1D1E4C !important; --im-accent: #FF7A08; --im-accent-ink: #A84C00; background: #F4F7FA !important; color: #1D1E4C; color-scheme: light; }
.cert-page .brand-logo-light { display: block !important; }
.cert-page .brand-logo-dark { display: none !important; }

.cert-wrap { container-type: inline-size; container-name: cert; width: 100%; max-width: 1123px; margin: 0 auto; }
.cert-sheet { display: grid; grid-template-columns: 32cqw minmax(0, 1fr); aspect-ratio: 297 / 210; width: 100%; background: #fff; color: #1D1E4C; overflow: hidden; border-radius: .5cqw; box-shadow: 0 1px 2px rgb(29 30 76 / .08), 0 22px 50px -26px rgb(29 30 76 / .45); font-family: var(--font-platform), system-ui, sans-serif; line-height: 1.3; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
:where(.cert-sheet) :where(p, h1, h2, ul, dl, dd) { margin: 0; }
.cert-sheet h1, .cert-sheet h2 { letter-spacing: 0 !important; line-height: 1.2 !important; }

/* faixa marinho sólida; o laranja da marca é uma faixa viva e reta na borda de baixo (sem degradê: nada de marrom ou roxo no meio); todo o texto fica acima dela, sobre o navy */
.cert-band { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 3cqw 2.8cqw 6.4cqw; color: #fff; background: linear-gradient(to top, #FF7A08 0 1.1cqw, #1D1E4C 1.1cqw); }
.cert-band-logo { align-self: flex-start; height: 3.1cqw; }
.cert-band-logo img { display: block; height: 100%; width: auto; }
.cert-band-wordmark { font-weight: 800; font-size: 2.4cqw; }
.cert-band-seal { display: flex; flex-direction: column; align-items: center; gap: 1.5cqw; }
.cert-sealsvg { width: 23cqw !important; height: 23cqw !important; filter: drop-shadow(0 1.2cqw 1.6cqw rgb(0 0 0 / .28)); }
.cert-band-code { display: flex; flex-direction: column; align-items: center; gap: .15cqw; font-size: 1.15cqw; color: #fff; }
.cert-band-code span { font-size: 1.7cqw; font-weight: 800; letter-spacing: .06em; font-variant-numeric: tabular-nums; }
.cert-verify { align-self: stretch; display: flex; align-items: center; gap: 1.2cqw; }
.cert-qr { flex: none; box-sizing: border-box; width: 8.8cqw; height: 8.8cqw; padding: .75cqw; background: #fff; border-radius: 1cqw; }
.cert-qr svg { display: block; width: 100%; height: 100%; }
.cert-verify p { min-width: 0; display: flex; flex-direction: column; gap: .3cqw; font-size: 1cqw; color: #fff; }
.cert-verify strong { font-size: 1.35cqw; font-weight: 800; }
.cert-verify a { color: #fff; text-decoration: underline; text-underline-offset: .2cqw; overflow-wrap: anywhere; line-height: 1.25; }

/* papel */
.cert-body { display: flex; flex-direction: column; min-width: 0; padding: 4cqw 4.6cqw 3cqw 4.4cqw; }
.cert-sheet .cert-kicker { font-size: 1.5cqw !important; font-weight: 600 !important; color: rgb(29 30 76 / .72); }
.cert-name { margin-top: 2.2cqw; font-size: 5.6cqw; font-weight: 800; line-height: 1.04; letter-spacing: -.025em; overflow-wrap: anywhere; }
.cert-name[data-size='m'] { font-size: 4.8cqw; }
.cert-name[data-size='l'] { font-size: 4cqw; }
.cert-name[data-size='xl'] { font-size: 3.2cqw; }
.cert-lead { margin-top: 1.1cqw; font-size: 1.7cqw; color: rgb(29 30 76 / .8); }
.cert-trail { margin-top: .5cqw; align-self: flex-start; transform: rotate(-1.2deg); transform-origin: left center; }
.cert-trail span { display: block; font-family: var(--font-hand), 'Segoe Print', 'Bradley Hand', cursive; font-weight: 700; font-size: 7cqw; line-height: 1; color: #1D1E4C; text-wrap: balance; }
.cert-swoosh { display: block; width: 100%; height: 1.15cqw; margin-top: .3cqw; }
.cert-what { margin-top: 1.5cqw; max-width: 52cqw; text-wrap: pretty; font-size: 1.5cqw; line-height: 1.4; color: rgb(29 30 76 / .86); }

.cert-comps { margin-top: 2.2cqw; flex: 1 1 auto; min-height: 0; }
.cert-comps h2, .cert-courses h2 { font-size: 1.5cqw; font-weight: 800; color: #1D1E4C; }
.cert-comps ul { margin-top: 1.1cqw; padding: 0; list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 1.5cqw 2.6cqw; }
.cert-comps ul:has(> li:last-child:nth-child(odd)) > li:last-child { grid-column: 1 / -1; }
.cert-comps li { padding-left: 1.1cqw; border-left: .3cqw solid #FF7A08; display: flex; flex-direction: column; gap: .3cqw; }
.cert-comps li strong { font-size: 1.4cqw; font-weight: 700; line-height: 1.22; }
.cert-comps li span { font-size: 1.2cqw; line-height: 1.34; color: rgb(29 30 76 / .82); }
.cert-comps[data-count='5'] ul, .cert-comps[data-count='6'] ul { gap: 1.1cqw 2.6cqw; }
.cert-comps[data-count='5'] li strong, .cert-comps[data-count='6'] li strong { font-size: 1.3cqw; }
.cert-comps[data-count='5'] li span, .cert-comps[data-count='6'] li span { font-size: 1.1cqw; line-height: 1.3; }

.cert-courses { margin-top: 1.6cqw; display: flex; flex-wrap: wrap; align-items: baseline; gap: .4cqw 1.2cqw; }
.cert-courses ul { padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: .3cqw 1.4cqw; font-size: 1.3cqw; }
.cert-courses li { position: relative; }
.cert-courses li:not(:last-child)::after { content: ''; position: absolute; right: -.95cqw; top: .55em; width: .4cqw; height: .4cqw; border-radius: 50%; background: #FF7A08; }

/* trilha com 5 ou mais competências: a mesma folha, com tipografia e espaços um pouco menores para caber tudo */
.cert-body[data-dense] { padding: 3.2cqw 4.4cqw 2.4cqw; }
.cert-body[data-dense] .cert-name { margin-top: 1.4cqw; font-size: 4.4cqw; }
.cert-body[data-dense] .cert-name[data-size='l'] { font-size: 3.8cqw; }
.cert-body[data-dense] .cert-name[data-size='xl'] { font-size: 3cqw; }
.cert-body[data-dense] .cert-lead { margin-top: .7cqw; font-size: 1.5cqw; }
.cert-body[data-dense] .cert-trail span { font-size: 5.4cqw; }
.cert-body[data-dense] .cert-what { margin-top: 1cqw; max-width: 56cqw; font-size: 1.35cqw; }
.cert-body[data-dense] .cert-comps { margin-top: 1.5cqw; }
.cert-body[data-dense] .cert-comps ul { margin-top: .9cqw; gap: 1cqw 2.4cqw; }
.cert-body[data-dense] .cert-courses { margin-top: 1.2cqw; }
.cert-body[data-dense] .cert-courses ul { font-size: 1.15cqw; }
.cert-body[data-dense] .cert-foot { margin-top: 1.2cqw; padding-top: 1cqw; }
.cert-body[data-dense] .cert-foot dd { font-size: 1.45cqw; }

.cert-foot { margin-top: 1.7cqw; padding-top: 1.3cqw; border-top: .14cqw solid #1D1E4C; display: grid; grid-template-columns: 1fr 1fr; gap: 2cqw 2.6cqw; }
.cert-foot dt { font-size: 1.1cqw; color: rgb(29 30 76 / .72); }
.cert-foot dd { margin-top: .25cqw; font-size: 1.6cqw; font-weight: 800; font-variant-numeric: tabular-nums; }

/* celular: ficha empilhada (a folha em miniatura ficaria com texto de ~5 px) */
@container cert (max-width: 879px) {
  .cert-sheet { display: block; aspect-ratio: auto; border-radius: 16px; line-height: 1.35; }
  .cert-band { padding: 20px 20px 40px; gap: 18px; background: linear-gradient(to top, #FF7A08 0 6px, #1D1E4C 6px); align-items: stretch; }
  .cert-band-logo { height: 26px; }
  .cert-band-seal { gap: 12px; }
  .cert-sealsvg { width: 168px !important; height: 168px !important; filter: drop-shadow(0 8px 12px rgb(0 0 0 / .28)); }
  .cert-band-code { font-size: 14px; gap: 2px; }
  .cert-band-code span { font-size: 20px; }
  .cert-qr { display: none; }
  .cert-verify { justify-content: center; text-align: center; padding-bottom: 6px; }
  .cert-verify p { align-items: center; font-size: 14px; gap: 2px; }
  .cert-verify strong { font-size: 15px; }
  .cert-body { padding: 24px 20px 26px; }
  .cert-sheet .cert-kicker { font-size: 16px !important; }
  .cert-name { margin-top: 14px; font-size: 34px; }
  .cert-name[data-size] { font-size: 34px; }
  .cert-name[data-size='l'], .cert-name[data-size='xl'] { font-size: 28px; }
  .cert-lead { margin-top: 8px; font-size: 17px; }
  .cert-trail span { font-size: 44px; }
  .cert-swoosh { height: 11px; margin-top: 3px; }
  .cert-what { margin-top: 14px; max-width: none; font-size: 16px; }
  .cert-comps { margin-top: 24px; }
  .cert-comps h2, .cert-courses h2 { font-size: 17px; }
  .cert-comps ul { grid-template-columns: 1fr; gap: 14px; margin-top: 12px; }
  .cert-comps ul:has(> li:last-child:nth-child(odd)) > li:last-child { grid-column: 1 / -1; }
.cert-comps li { padding-left: 12px; border-left-width: 3px; gap: 3px; }
  .cert-comps li strong, .cert-comps[data-count] li strong { font-size: 16px; }
  .cert-comps li span, .cert-comps[data-count] li span { font-size: 15px; line-height: 1.4; }
  .cert-courses { margin-top: 22px; display: block; }
  .cert-courses ul { margin-top: 8px; display: block; font-size: 15px; }
  .cert-courses li { padding-left: 16px; margin-bottom: 4px; }
  .cert-courses li:not(:last-child)::after { content: none; }
  .cert-courses li::before { content: ''; position: absolute; left: 0; top: .5em; width: 6px; height: 6px; border-radius: 50%; background: #FF7A08; }
  .cert-foot { margin-top: 22px; padding-top: 16px; border-top-width: 2px; grid-template-columns: auto auto; gap: 14px 16px; justify-content: space-between; }
  .cert-foot dt { font-size: 14px; }
  .cert-foot dd { margin-top: 2px; font-size: 17px; white-space: nowrap; }
}

@media print {
  html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
  .cert-noprint { display: none !important; }
  .cert-page { background: #fff !important; min-height: 0 !important; }
  .cert-main { max-width: none !important; margin: 0 !important; padding: 0 !important; }
  .cert-wrap { width: 297mm !important; max-width: none !important; margin: 0 !important; break-inside: avoid; }
  .cert-sheet { height: 209.5mm !important; aspect-ratio: auto !important; border-radius: 0 !important; box-shadow: none !important; }
}
`;
