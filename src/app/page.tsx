import { redirect } from 'next/navigation';
import App from '@/components/App';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function Page() {
  if (!(await getSession())) redirect('/login');
  return <App />;
}
