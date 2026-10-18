import { redirect } from 'next/navigation';
import LoginForm from '@/components/LoginForm';
import { DEMO_ACCOUNTS, authMode, getSession } from '@/lib/auth';
import { ROLE_LABEL } from '@/lib/domain';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Logowanie · Panel rekrutacji' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSession()) redirect('/');
  const { error } = await searchParams;
  const mode = authMode();
  const accounts =
    mode === 'demo'
      ? DEMO_ACCOUNTS.map((a) => ({ id: a.id, name: a.name, email: a.email, role: a.role, roleLabel: ROLE_LABEL[a.role], city: a.city }))
      : [];
  return <LoginForm mode={mode} error={error ?? ''} accounts={accounts} />;
}
