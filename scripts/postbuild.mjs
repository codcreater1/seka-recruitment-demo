// After `next build`: put static files, public assets and sample data next to the standalone server,
// so `npm start` and the Docker image run exactly the same server.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.next', 'standalone');

if (!fs.existsSync(out)) {
  console.warn('postbuild: .next/standalone not found, nothing to copy');
  process.exit(0);
}

const copy = (from, to) => {
  if (fs.existsSync(from)) fs.cpSync(from, to, { recursive: true });
};
copy(path.join(root, '.next', 'static'), path.join(out, '.next', 'static'));
copy(path.join(root, 'public'), path.join(out, 'public'));
copy(path.join(root, 'seed'), path.join(out, 'seed'));
console.log('postbuild: standalone server is ready (.next/standalone)');
