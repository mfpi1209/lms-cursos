// QA visual como aluna (lote 04), Playwright isolado. Para rodar: copiar para apps/web/e2e/ e `OUT=<pasta> node <arquivo> aula_01|aula_02 first|mid|last [mobile]`
import { chromium } from '@playwright/test';
const OUT = process.env.OUT;
const ENR = 'enr_6qxr2rxsg8c2kyx4';
const lesson = process.argv[2] ?? 'aula_01';
const pick = process.argv[3] ?? 'first';
const vp = process.argv[4] === 'mobile' ? { width: 390, height: 844 } : { width: 1366, height: 820 };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: vp, baseURL: 'http://localhost:3010' });
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
await page.goto('/login');
await page.getByLabel('E-mail').fill('aluna@demo.local');
await page.getByLabel('Senha').fill('senha-dev-123');
await page.getByRole('button', { name: 'Entrar' }).click();
await page.waitForURL((u) => !u.pathname.startsWith('/login'));
// recomeça a aula
await page.request.post(`/api/enrollments/${ENR}/lessons/${lesson}/attempts`, { data: { forceNew: true } });
await page.goto(`/aprender/${ENR}/aulas/${lesson}`);
await page.waitForTimeout(2500);
let last = '';
for (let i = 0; i < 40; i++) {
  if (await page.getByTestId('player-completed').isVisible().catch(() => false)) { await page.screenshot({ path: `${OUT}/${lesson}-${vp.width}-zz-fim.png` }); console.log('FIM'); break; }
  const node = page.getByTestId('player-node');
  const id = (await node.getAttribute('data-node-id').catch(() => null)) ?? '?';
  const type = (await node.getAttribute('data-node-type').catch(() => null)) ?? '?';
  const tag = `${String(i).padStart(2, '0')}-${id}`;
  if (id !== last) { await page.screenshot({ path: `${OUT}/${lesson}-${vp.width}-${tag}.png` }); last = id; }
  const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 600);
  console.log(`[${tag}] ${type}: ${text}`);
  const click = async (tid) => { const l = page.getByTestId(tid); if (await l.isVisible().catch(() => false)) { await l.click(); return true; } return false; };
  if (await click('reaction-continue')) { await page.waitForTimeout(800); continue; }
  if (type === 'choice') {
    const opts = page.locator('[data-testid^="option-"]');
    const n = await opts.count();
    await opts.nth(pick === 'last' ? n - 1 : pick === 'mid' ? 1 : 0).click();
    await click('player-submit');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${lesson}-${vp.width}-${tag}-feedback.png` });
    console.log('   feedback:', (await page.getByTestId('choice-feedback').innerText().catch(() => '—')).replace(/\s+/g, ' '));
    if (await page.getByTestId('player-watch').isVisible().catch(() => false)) await click('player-skip');
  } else if (type === 'reflection') {
    const panel = page.getByTestId('compose-panel');
    const chips = panel.locator('button');
    const labels = await chips.allInnerTexts();
    console.log('   chips:', labels.join(' | ').slice(0, 400));
    // toca o primeiro bloco de cada lacuna: clica botões até o enviar habilitar
    for (let k = 0; k < (await chips.count()) && k < 30; k++) {
      if (await page.getByTestId('player-submit').isEnabled().catch(() => false)) break;
      await chips.nth(k).click().catch(() => {});
      await page.waitForTimeout(150);
    }
    await page.screenshot({ path: `${OUT}/${lesson}-${vp.width}-${tag}-montada.png` });
    await click('player-submit');
  } else if (type === 'assessment') {
    const opts = page.locator('[data-testid^="option-"]');
    await opts.nth(pick === 'last' ? (await opts.count()) - 1 : 0).click();
    await click('player-submit');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/${lesson}-${vp.width}-${tag}-resultado.png` });
    console.log('   resultado:', (await page.getByTestId('assessment-result').innerText().catch(() => '—')).replace(/\s+/g, ' ').slice(0, 300));
    await click('player-continue');
  } else if (type === 'end') {
    console.log('END node'); break;
  } else {
    (await click('player-skip')) || (await click('player-continue')) || (await click('player-watch'));
  }
  await page.waitForTimeout(1500);
}
console.log('console errors:', errs.length, errs.slice(0, 5));
await b.close();
