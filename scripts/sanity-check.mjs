import { createServer } from 'vite';
import { exec } from 'node:child_process';

const port = 5174;
const url = `http://localhost:${port}/sanity-check.html`;

const openUrl = (target) => {
  const platform = process.platform;
  const command = platform === 'darwin'
    ? `open "${target}"`
    : platform === 'win32'
      ? `start "" "${target}"`
      : `xdg-open "${target}"`;

  exec(command, (err) => {
    if (err) {
      console.warn('[sanity-check] Unable to auto-open browser. Open this URL manually:', target);
    }
  });
};

const run = async () => {
  const server = await createServer({
    server: { port, strictPort: true },
  });

  await server.listen();
  console.log('Sanity check server running.');
  console.log(`Open: ${url}`);
  console.log('Results will appear in the browser console and on-page output.');

  openUrl(url);

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

run().catch((err) => {
  console.error('[sanity-check] Failed to start Vite server:', err);
});
