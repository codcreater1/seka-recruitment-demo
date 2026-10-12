import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

// Browser hardening that cannot get in the way of the app. No script-src rule on purpose: Next.js hydrates
// with inline scripts, and the CV preview is a PDF shown in a same-origin frame.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'self'" },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // pin the tracing root so the standalone build has the same layout on every machine
  outputFileTracingRoot: root,
  serverExternalPackages: ['better-sqlite3', 'mailparser', 'nodemailer'],
  poweredByHeader: false,
  env: { NEXT_PUBLIC_APP_VERSION: version },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
