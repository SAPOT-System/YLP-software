import { cookies } from 'next/headers';
import ChangePasswordForm from './ChangePasswordForm';

export default async function ChangePasswordPage() {
  const cookieStore = await cookies();
  return <ChangePasswordForm termsRequired={cookieStore.get('terms_acceptance_required')?.value === 'true'} />;
}
