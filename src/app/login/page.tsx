import { redirect } from 'next/navigation';
import LoginForm from '@/components/LoginForm';
import { authMode, demoAccounts, getSession } from '@/lib/auth';
import { getRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Logowanie · Panel rekrutacji' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSession()) redirect('/');
  const { error } = await searchParams;
  const mode = authMode();
  const accounts =
    mode === 'demo'
      ? demoAccounts().map((a) => ({ id: a.id, name: a.name, email: a.email, role: a.role, roleLabel: getRole(a.role)?.label ?? a.role, city: a.city }))
      : [];
  return <LoginForm mode={mode} error={error ?? ''} accounts={accounts} />;
}
