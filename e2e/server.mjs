// Playwright owns this process. Never use or erase a developer's .data.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const directory = mkdtempSync(join(tmpdir(), 'orbital-e2e-'));
const port = process.env.E2E_PORT ?? '5187';
// The fake assistant's lookups reach /api/query where this server listens (it isn't on [::1], the default).
const server = spawn(process.execPath, ['node_modules/@react-router/serve/bin.cjs', './build/server/index.js'], {
  stdio: 'inherit',
  env: { ...process.env, HOST: '127.0.0.1', PORT: port, ORBITAL_DATA_DIR: directory, ORBITAL_ANALYTICS: 'off', ORBITAL_ASSISTANT_PROVIDER: 'fake', ORBITAL_QUERY_URL: `http://127.0.0.1:${port}/api/query` },
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.kill(signal));
server.on('error', error => { console.error(error); process.exitCode = 1; });
server.on('close', code => {
  rmSync(directory, { recursive: true, force: true });
  process.exitCode = code ?? 0;
});
