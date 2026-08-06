'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { withBasePath } from '@/lib/basePath';

export default function LoginPage() {
  const hasSubmitted = useRef(false);
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (hasSubmitted.current) return;
    hasSubmitted.current = true;

    setIsPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    try {
      const res = await fetch(withBasePath('/api/login'), {
        method: 'POST',
        body: formData, // ✅ IMPORTANT: matches req.formData()
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || 'Invalid credentials');
        return;
      }

      // success → redirect
      router.push('/dashboard');
    } catch (err) {
      setError('Network error');
    } finally {
      hasSubmitted.current = false;
      setIsPending(false);
    }
  };

  return (
    <main className="relative min-h-screen w-full flex flex-col p-4">

      {/* Background */}
      <div className="fixed inset-0 -z-10">
        <Image
          src={withBasePath('/backgrounds/login.png')}
          alt="Background"
          fill
          priority={false}
          loading="lazy"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/20 to-transparent" />
        <div className="absolute inset-0 bg-black/15" />
      </div>

      {/* Logo */}
      <div className="flex py-4 items-center gap-2 text-white font-bold text-xl">
        <Image src={withBasePath('/logos/logo.png')} alt="Logo" width={32} height={32} />
        <span className="font-custom-color">SAPOT</span>
      </div>

      {/* Card */}
      <div className="w-full flex justify-center items-center">
        <div className="w-full max-w-[400px] bg-white rounded-3xl shadow-2xl p-10 flex flex-col items-center">

          <h1 className="text-2xl font-bold mb-1">Welcome Admin!</h1>
          <p className="text-gray-400 text-xs mb-8">Please login to continue</p>

          <form onSubmit={handleSubmit} className="w-full space-y-5">

            {/* Username */}
            <div>
              <label className="text-sm font-semibold">Username</label>
              <input
                name="username"
                type="text"
                placeholder="Username"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {/* Password */}
            <div>
              <label className="text-sm font-semibold">Password</label>
              <input
                name="password"
                type="password"
                placeholder="Password"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {/* Button */}
            <button
              disabled={isPending}
              className="w-full bg-[#4481eb] text-white py-3 rounded-full font-semibold shadow-lg disabled:opacity-50"
            >
              {isPending ? <Spinner /> : 'Login'}
            </button>

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 text-red-500 text-xs rounded-xl text-center">
                {error}
              </div>
            )}
          </form>
        </div>
      </div>
    </main>
  );
}

/* Spinner */
function Spinner() {
  return (
    <div className="flex justify-center">
      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
