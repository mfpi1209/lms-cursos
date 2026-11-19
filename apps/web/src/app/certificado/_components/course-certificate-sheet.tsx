export interface CourseCertificateData {
  /** marca da plataforma na faixa (logo branco); ausente quando o emissor pediu para não mostrar */
  platform?: { name: string; logoDark?: string; logoRatio?: number };
  /** quem emite: nome sempre presente (instituição configurada ou a marca da plataforma) */
  issuer: { name: string; cnpj?: string; logoUrl?: string; signatureUrl?: string; signerName?: string; signerRole?: string };
  holderName: string;
  /** só para a própria pessoa e para a equipe; a verificação pública nunca recebe */
  holderRgm?: string;
  courseTitle: string;
  workload: string;
  completedOn: string;
  issuedOn: string;
  program: Array<{ title: string; duration: string }>;
  code: string;
  verifyUrl: string;
  verifyShort: string;
  qrSvg: string;
}

function Swoosh() {
  return (
    <svg viewBox="0 0 200 18" preserveAspectRatio="none" aria-hidden="true" className="cc-swoosh">
      <path d="M3 12c38-6 92-9 194-5" fill="none" stroke="#FF7A08" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

const nameSize = (n: string) => (n.length > 34 ? 'xl' : n.length > 24 ? 'l' : n.length > 17 ? 'm' : 's');
const titleSize = (t: string) => (t.length > 60 ? 'xl' : t.length > 44 ? 'l' : t.length > 30 ? 'm' : 's');

/**
 * Folha do certificado de curso (A4 paisagem). Faixa marinho à esquerda com o QR em destaque (é ele que torna o papel
 * conferível) e o código; papel branco com titular, curso em letra manuscrita, a declaração, o conteúdo programático
 * e o rodapé com assinatura, datas e carga horária. Texto sempre real; medidas em `cqw` (ver COURSE_CERT_CSS).
 */
export function CourseCertificateSheet({ d }: { d: CourseCertificateData }) {
  const dense = d.program.length > 6;
  return (
    <div className="cc-wrap">
      <article className="cc-sheet" aria-labelledby="cc-title" data-testid="course-certificate">
        <aside className="cc-band">
          <div className="cc-band-logo">
            {d.platform ? (
              d.platform.logoDark ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.platform.logoDark} alt={d.platform.name} width={Math.round(34 * (d.platform.logoRatio ?? 4))} height={34} />
              ) : (
                <span className="cc-wordmark">{d.platform.name}</span>
              )
            ) : (
              <span className="cc-wordmark">{d.issuer.name}</span>
            )}
          </div>

          <div className="cc-verify">
            <div className="cc-qr" role="img" aria-label={`QR code que leva à verificação do certificado ${d.code}: ${d.verifyUrl}`} dangerouslySetInnerHTML={{ __html: d.qrSvg }} />
            <p className="cc-scan">Aponte a câmera para conferir a autenticidade</p>
          </div>

          <div className="cc-band-foot">
            <p className="cc-code">
              Código
              <span data-testid="course-certificate-code">{d.code}</span>
            </p>
            <a href={d.verifyUrl}>{d.verifyShort}</a>
          </div>
        </aside>

        <div className="cc-body" data-dense={dense ? 'true' : undefined}>
          <div className="cc-head">
            <h1 id="cc-title" className="cc-kicker">Certificado de conclusão</h1>
            {d.issuer.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="cc-issuer-logo" src={d.issuer.logoUrl} alt={d.issuer.name} />
            )}
          </div>

          <p className="cc-name" data-size={nameSize(d.holderName)} data-testid="course-certificate-holder">
            {d.holderName}
          </p>
          <p className="cc-lead">concluiu o curso</p>
          <p className="cc-course" data-size={titleSize(d.courseTitle)}>
            <span>{d.courseTitle}</span>
            <Swoosh />
          </p>
          <p className="cc-what">
            Curso livre oferecido por {d.issuer.name}, com carga horária de {d.workload}, concluído em {d.completedOn}. Para receber este certificado, concluiu todas as aulas obrigatórias e foi aprovado nas avaliações do curso.
          </p>

          {d.program.length > 0 && (
            <section className="cc-program" aria-labelledby="cc-program-h" data-count={d.program.length}>
              <h2 id="cc-program-h">Conteúdo programático</h2>
              <ol>
                {d.program.map((m) => (
                  <li key={m.title}>
                    <span>{m.title}</span>
                    {m.duration && <em>{m.duration}</em>}
                  </li>
                ))}
              </ol>
            </section>
          )}

          <div className="cc-foot">
            <div className="cc-sign">
              {d.issuer.signatureUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="cc-signature" src={d.issuer.signatureUrl} alt={d.issuer.signerName ? `Assinatura de ${d.issuer.signerName}` : 'Assinatura'} />
              )}
              <p className="cc-sign-line">
                {d.issuer.signerName ? <strong>{d.issuer.signerName}</strong> : <strong>{d.issuer.name}</strong>}
                {d.issuer.signerName ? <span>{[d.issuer.signerRole, d.issuer.name].filter(Boolean).join(' · ')}</span> : <span>Emitido eletronicamente</span>}
                {d.issuer.cnpj && <span>CNPJ {d.issuer.cnpj}</span>}
              </p>
            </div>
            <dl className="cc-facts">
              <div>
                <dt>Emitido em</dt>
                <dd>{d.issuedOn}</dd>
              </div>
              <div>
                <dt>Carga horária</dt>
                <dd data-testid="course-certificate-workload">{d.workload}</dd>
              </div>
              {d.holderRgm && (
                <div>
                  <dt>RGM</dt>
                  <dd data-testid="course-certificate-rgm">{d.holderRgm}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </article>
    </div>
  );
}

/**
 * A4 paisagem, sempre claro (também na impressão). Tela larga e impressão em `cqw` (1% da largura da folha); abaixo de
 * 880 px vira ficha empilhada (no celular o A4 em miniatura teria texto de ~5 px) e o QR continua visível, menor.
 */
export const COURSE_CERT_CSS = `
@page { size: A4 landscape; margin: 0; }
.cert-page { --t-bg: #F4F7FA !important; --t-bg-2: #fff !important; --t-surface: #fff !important; --t-fg: #1D1E4C !important; --t-fg-muted: #4a4d6e !important; --t-fg-faint: #5c5f80 !important; --t-line: #d8dce8 !important; --t-line-strong: #8a8da6 !important; --t-accent: #A84C00 !important; --t-accent-fill: #FF7A08 !important; --t-accent-fill-fg: #1D1E4C !important; background: #F4F7FA !important; color: #1D1E4C; color-scheme: light; }
.cert-page .brand-logo-light { display: block !important; }
.cert-page .brand-logo-dark { display: none !important; }

.cc-wrap { container-type: inline-size; container-name: cc; width: 100%; max-width: 1123px; margin: 0 auto; }
.cc-sheet { display: grid; grid-template-columns: 27cqw minmax(0, 1fr); aspect-ratio: 297 / 210; width: 100%; background: #fff; color: #1D1E4C; overflow: hidden; border-radius: .5cqw; box-shadow: 0 1px 2px rgb(29 30 76 / .08), 0 22px 50px -26px rgb(29 30 76 / .45); font-family: var(--font-platform), system-ui, sans-serif; line-height: 1.3; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
:where(.cc-sheet) :where(p, h1, h2, ol, dl, dd) { margin: 0; }
.cc-sheet h1, .cc-sheet h2 { letter-spacing: 0 !important; line-height: 1.2 !important; }

.cc-band { display: flex; flex-direction: column; justify-content: space-between; gap: 2cqw; padding: 3cqw 2.6cqw 4.4cqw; color: #fff; background: linear-gradient(to top, #FF7A08 0 1.1cqw, #1D1E4C 1.1cqw); }
.cc-band-logo { height: 3.1cqw; }
.cc-band-logo img { display: block; height: 100%; width: auto; }
.cc-wordmark { font-weight: 800; font-size: 2.2cqw; line-height: 1.1; }
.cc-verify { display: flex; flex-direction: column; align-items: center; gap: 1.2cqw; }
.cc-qr { box-sizing: border-box; width: 18cqw; height: 18cqw; padding: 1.3cqw; background: #fff; border-radius: 1.4cqw; box-shadow: 0 1.2cqw 2.4cqw -1cqw rgb(0 0 0 / .45); }
.cc-qr svg { display: block; width: 100%; height: 100%; }
.cc-scan { max-width: 18cqw; text-align: center; font-size: 1.15cqw; line-height: 1.3; color: rgb(255 255 255 / .9); text-wrap: balance; }
.cc-band-foot { display: flex; flex-direction: column; gap: .7cqw; }
.cc-code { display: flex; flex-direction: column; gap: .15cqw; font-size: 1.1cqw; color: rgb(255 255 255 / .85); }
.cc-code span { font-size: 2cqw; font-weight: 800; color: #fff; letter-spacing: .06em; font-variant-numeric: tabular-nums; }
.cc-band-foot a { font-size: 1cqw; color: #fff; text-decoration: underline; text-underline-offset: .2cqw; overflow-wrap: anywhere; line-height: 1.25; }

.cc-body { display: flex; flex-direction: column; min-width: 0; padding: 3.6cqw 4.6cqw 3cqw 4.4cqw; }
.cc-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 2cqw; min-height: 4cqw; }
.cc-sheet .cc-kicker { font-size: 1.5cqw !important; font-weight: 600 !important; color: rgb(29 30 76 / .72); }
.cc-issuer-logo { display: block; max-height: 4.4cqw; max-width: 16cqw; width: auto; object-fit: contain; }
.cc-name { margin-top: 1.2cqw; font-size: 5.4cqw; font-weight: 800; line-height: 1.04; letter-spacing: -.025em; overflow-wrap: anywhere; }
.cc-name[data-size='m'] { font-size: 4.6cqw; }
.cc-name[data-size='l'] { font-size: 3.9cqw; }
.cc-name[data-size='xl'] { font-size: 3.1cqw; }
.cc-lead { margin-top: 1cqw; font-size: 1.7cqw; color: rgb(29 30 76 / .8); }
.cc-course { margin-top: .5cqw; align-self: flex-start; max-width: 100%; transform: rotate(-1deg); transform-origin: left center; }
.cc-course span { display: block; font-family: var(--font-hand), 'Segoe Print', 'Bradley Hand', cursive; font-weight: 700; font-size: 5.6cqw; line-height: 1.02; color: #1D1E4C; text-wrap: balance; }
.cc-course[data-size='m'] span { font-size: 4.6cqw; }
.cc-course[data-size='l'] span { font-size: 3.9cqw; }
.cc-course[data-size='xl'] span { font-size: 3.2cqw; }
.cc-swoosh { display: block; width: 100%; height: 1.1cqw; margin-top: .3cqw; }
.cc-what { margin-top: 1.5cqw; max-width: 58cqw; text-wrap: pretty; font-size: 1.4cqw; line-height: 1.42; color: rgb(29 30 76 / .86); }

.cc-program { margin-top: 2cqw; flex: 1 1 auto; min-height: 0; }
.cc-program h2 { font-size: 1.45cqw; font-weight: 800; color: #1D1E4C; }
.cc-program ol { margin-top: 1cqw; padding: 0; list-style: none; counter-reset: cc; display: grid; grid-template-columns: 1fr 1fr; gap: .9cqw 2.6cqw; }
.cc-program li { counter-increment: cc; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: baseline; gap: .8cqw; font-size: 1.3cqw; line-height: 1.3; padding-bottom: .7cqw; border-bottom: .1cqw solid #e3e6ef; }
.cc-program li::before { content: counter(cc); font-weight: 800; color: #A84C00; font-variant-numeric: tabular-nums; }
.cc-program li em { font-style: normal; font-size: 1.15cqw; color: rgb(29 30 76 / .7); white-space: nowrap; font-variant-numeric: tabular-nums; }

.cc-body[data-dense] .cc-name { font-size: 4.4cqw; }
.cc-body[data-dense] .cc-course span { font-size: 4.2cqw; }
.cc-body[data-dense] .cc-program ol { gap: .55cqw 2.4cqw; }
.cc-body[data-dense] .cc-program li { font-size: 1.15cqw; padding-bottom: .45cqw; }

.cc-foot { margin-top: 1.8cqw; padding-top: 1.4cqw; border-top: .14cqw solid #1D1E4C; display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 2.6cqw; align-items: end; }
.cc-sign { display: flex; flex-direction: column; gap: .4cqw; }
.cc-signature { display: block; height: 4.6cqw; width: auto; max-width: 22cqw; object-fit: contain; object-position: left bottom; margin-bottom: -.4cqw; }
.cc-sign-line { display: flex; flex-direction: column; gap: .15cqw; font-size: 1.1cqw; color: rgb(29 30 76 / .78); }
.cc-sign-line strong { font-size: 1.45cqw; font-weight: 800; color: #1D1E4C; }
.cc-facts { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 2cqw; }
.cc-facts dt { font-size: 1.05cqw; color: rgb(29 30 76 / .72); }
.cc-facts dd { margin-top: .25cqw; font-size: 1.5cqw; font-weight: 800; font-variant-numeric: tabular-nums; }

@container cc (max-width: 879px) {
  .cc-sheet { display: block; aspect-ratio: auto; border-radius: 16px; line-height: 1.35; }
  .cc-band { padding: 20px 20px 34px; gap: 18px; background: linear-gradient(to top, #FF7A08 0 6px, #1D1E4C 6px); }
  .cc-band-logo { height: 26px; }
  .cc-wordmark { font-size: 20px; }
  .cc-verify { flex-direction: row; justify-content: flex-start; gap: 14px; }
  .cc-qr { width: 112px; height: 112px; padding: 8px; border-radius: 10px; flex: none; }
  .cc-scan { max-width: none; text-align: left; font-size: 15px; }
  .cc-code { font-size: 14px; }
  .cc-code span { font-size: 20px; }
  .cc-band-foot a { font-size: 14px; }
  .cc-body { padding: 24px 20px 26px; }
  .cc-sheet .cc-kicker { font-size: 16px !important; }
  .cc-issuer-logo { max-height: 36px; max-width: 120px; }
  .cc-name, .cc-name[data-size] { margin-top: 12px; font-size: 32px; }
  .cc-name[data-size='l'], .cc-name[data-size='xl'] { font-size: 27px; }
  .cc-lead { margin-top: 8px; font-size: 17px; }
  .cc-course span, .cc-course[data-size] span { font-size: 36px; }
  .cc-course[data-size='l'] span, .cc-course[data-size='xl'] span { font-size: 30px; }
  .cc-swoosh { height: 10px; }
  .cc-what { margin-top: 14px; max-width: none; font-size: 16px; }
  .cc-program { margin-top: 22px; }
  .cc-program h2 { font-size: 17px; }
  .cc-program ol { grid-template-columns: 1fr; gap: 10px; margin-top: 10px; }
  .cc-program li, .cc-body[data-dense] .cc-program li { font-size: 15px; gap: 10px; padding-bottom: 8px; border-bottom-width: 1px; }
  .cc-program li em { font-size: 14px; }
  .cc-foot { margin-top: 22px; padding-top: 16px; border-top-width: 2px; grid-template-columns: 1fr; gap: 18px; }
  .cc-signature { height: 52px; max-width: 220px; }
  .cc-sign-line { font-size: 14px; }
  .cc-sign-line strong { font-size: 17px; }
  .cc-facts { grid-auto-flow: row; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px 16px; }
  .cc-facts dt { font-size: 14px; }
  .cc-facts dd { font-size: 17px; }
}

@media print {
  html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
  .cert-noprint { display: none !important; }
  .cert-page { background: #fff !important; min-height: 0 !important; }
  .cert-main { max-width: none !important; margin: 0 !important; padding: 0 !important; }
  .cc-wrap { width: 297mm !important; max-width: none !important; margin: 0 !important; break-inside: avoid; }
  .cc-sheet { height: 209.5mm !important; aspect-ratio: auto !important; border-radius: 0 !important; box-shadow: none !important; }
}
`;
