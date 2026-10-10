import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // pin the tracing root so the standalone build has the same layout on every machine
  outputFileTracingRoot: root,
  serverExternalPackages: ['better-sqlite3', 'mailparser', 'nodemailer'],
  poweredByHeader: false,
};

export default nextConfig;
