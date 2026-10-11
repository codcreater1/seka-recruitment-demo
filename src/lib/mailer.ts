import nodemailer, { type Transporter } from 'nodemailer';

export type DeliveryResult = { status: 'sent' | 'simulated' | 'failed'; error: string };
export type MailAttachment = { filename: string; content: string; contentType: string };

let transport: Transporter | null = null;

/** SMTP is optional. Without SMTP_HOST every message is only recorded ("simulated"). */
export const smtpConfigured = () => !!process.env.SMTP_HOST;

function getTransport() {
  if (!transport) {
    const user = process.env.SMTP_USER;
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: user ? { user, pass: process.env.SMTP_PASS || '' } : undefined,
    });
  }
  return transport;
}

export async function deliver(msg: { to: string; subject: string; text: string; attachments?: MailAttachment[] }): Promise<DeliveryResult> {
  if (!smtpConfigured()) return { status: 'simulated', error: '' };
  if (!msg.to || !msg.to.includes('@')) return { status: 'failed', error: 'Brak poprawnego adresu odbiorcy.' };
  try {
    await getTransport().sendMail({
      from: process.env.SMTP_FROM || 'rekrutacja@localhost',
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
