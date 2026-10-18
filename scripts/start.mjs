// Starts the production server built by `npm run build`.
// Settings: PORT (default 3000), HOST (default 0.0.0.0), DATA_DIR (default ./data), SEED_DIR (default ./seed).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = path.join(root, '.next', 'standalone', 'server.js');

if (!fs.existsSync(server)) {
  console.error('Production build not found. Run "npm run build" first.');
  process.exit(1);
}

process.env.DATA_DIR ||= path.join(root, 'data');
process.env.SEED_DIR ||= path.join(root, 'seed');
process.env.PORT ||= '3000';
// The HOSTNAME variable of many shells holds the computer name, which would make the server unreachable
// on localhost, so it is set explicitly here.
process.env.HOSTNAME = process.env.HOST || '0.0.0.0';

if (process.env.AUTH_MODE !== 'entra' && !process.env.DEMO_PASSWORD) {
  console.log('Note: AUTH_MODE=demo and DEMO_PASSWORD is not set. The demo accounts have no passwords, so anyone who can reach');
  console.log('this address can sign in as the administrator. Set DEMO_PASSWORD (or AUTH_MODE=entra) before sharing the link.');
}

await import(pathToFileURL(server).href);
