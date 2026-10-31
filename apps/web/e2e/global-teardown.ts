import { readState } from './env';

/** Encerra o worker iniciado no globalSetup. O servidor web é encerrado pelo próprio Playwright (`webServer`). */
export default async function globalTeardown() {
  const state = readState();
  if (!state?.workerPid) return;
  try {
    process.kill(state.workerPid, 'SIGTERM');
    console.log(`[e2e] worker ${state.workerPid} encerrado`);
  } catch {
    /* já encerrado */
  }
}
