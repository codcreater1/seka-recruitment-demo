import nodemailer, { type Transporter } from 'nodemailer';

export type DeliveryResult = { status: 'sent' | 'simulated' | 'failed'; error: string };
export type MailAttachment = { filename: string; content: string; contentType: string };

import { getSystemConfig } from './system-config';

let transport: Transporter | null = null;
let transportKey = '';

/** SMTP is optional. Without SMTP_HOST every message is only recorded ("simulated"). */
export const smtpConfigured = () => !!getSystemConfig().smtpHost;

function getTransport() {
  const c = getSystemConfig();
  const key = JSON.stringify([c.smtpHost, c.smtpPort, c.smtpSecure, c.smtpUser, c.smtpPass]);
  if (!transport || key !== transportKey) {
    transport = nodemailer.createTransport({
      host: c.smtpHost,
      port: c.smtpPort,
      secure: c.smtpSecure,
      auth: c.smtpUser ? { user: c.smtpUser, pass: c.smtpPass } : undefined,
    });
    transportKey = key;
  }
  return transport;
}

export async function deliver(msg: { to: string; subject: string; text: string; attachments?: MailAttachment[] }): Promise<DeliveryResult> {
  if (!smtpConfigured()) return { status: 'simulated', error: '' };
  if (!msg.to || !msg.to.includes('@')) return { status: 'failed', error: 'Brak poprawnego adresu odbiorcy.' };
  try {
    await getTransport().sendMail({
      from: getSystemConfig().mailbox,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      attachments: msg.attachments,
    });
    return { status: 'sent', error: '' };
  } catch (e) {
    return { status: 'failed', error: (e as Error).message.slice(0, 300) };
  }
}
