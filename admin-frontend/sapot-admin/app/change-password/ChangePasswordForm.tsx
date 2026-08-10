'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { withBasePath } from '@/lib/basePath';

export default function ChangePasswordForm({ termsRequired }: { termsRequired: boolean }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [terms, setTerms] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (termsRequired) fetch(withBasePath('/api/terms')).then((response) => response.text()).then(setTerms).catch(() => setError('Unable to load the Terms & Conditions.'));
  }, [termsRequired]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmation) return setError('New passwords do not match.');
    if (termsRequired && !accepted) return setError('You must accept the Terms & Conditions.');
    setPending(true); setError(null);
    try {
      const response = await fetch(withBasePath('/api/change-password'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current_password: currentPassword, new_password: newPassword, terms_accepted: accepted }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.detail?.message || data?.detail || 'Unable to change password.');
      router.push('/dashboard');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Network error.');
    } finally { setPending(false); }
  }

  return <main className="min-h-screen flex items-center justify-center bg-slate-100 p-4"><form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-8 shadow"><h1 className="text-2xl font-bold">Change your password</h1><p className="text-sm text-slate-600">Your initial password must be replaced before you can continue.</p><input required type="password" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full rounded border p-3" /><input required type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full rounded border p-3" /><input required type="password" placeholder="Confirm new password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className="w-full rounded border p-3" />{termsRequired && <><label className="flex gap-2 text-sm"><input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} /> I accept the Terms & Conditions.</label><details className="max-h-40 overflow-auto text-xs"><summary>Read Terms & Conditions</summary><pre className="whitespace-pre-wrap">{terms}</pre></details></>}{error && <p className="text-sm text-red-600">{error}</p>}<button disabled={pending || newPassword !== confirmation || (termsRequired && !accepted)} className="w-full rounded bg-blue-600 p-3 text-white disabled:opacity-50">{pending ? 'Updating...' : 'Change password'}</button></form></main>;
}
