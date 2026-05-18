'use client'
import { useActionState, useRef } from 'react';
import { loginAction } from '@/actions/auth';
import Image from 'next/image';

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, null);
  const hasSubmitted = useRef(false);

  const handleSubmit = async (formData: FormData) => {
    if (hasSubmitted.current) return; // prevent multiple requests
    hasSubmitted.current = true;
    await formAction(formData);
    hasSubmitted.current = false;
  };

  return (
    <main className="relative min-h-screen w-full flex flex-col p-4">
      
      {/* Background (defer heavy loading) */}
      <div className="fixed inset-0 -z-10">
        <Image
          src="/backgrounds/login.png"
          alt="Background"
          fill
          priority={false} // ✅ don't block page load
          loading="lazy"   // ✅ defer load
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/20 to-transparent" />
        <div className="absolute inset-0 bg-black/15" />
      </div>

      {/* Logo */}
      <div className="flex py-4 items-center gap-2 text-white font-bold text-xl">
        <Image src="/logos/logo.png" alt="Logo" width={32} height={32} />
        <span className='font-custom-color'>SAPOT</span>
      </div>

      {/* Card */}
      <div className='w-full flex justify-center items-center'>
        <div className="w-full max-w-[400px] bg-white rounded-3xl shadow-2xl p-10 flex flex-col items-center">

          <h1 className="text-2xl font-bold mb-1">Welcome Admin!</h1>
          <p className="text-gray-400 text-xs mb-8">Please login to continue</p>

          <form action={handleSubmit} className="w-full space-y-5">


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
						{state?.error && (
							<div className="p-3 bg-red-50 text-red-500 text-xs rounded-xl text-center">
								{state.error.msg || "Invalid Credentials"}
							</div>
						)}
          </form>
        </div>
      </div>
    </main>
  );
}

/* Extracted spinner (prevents re-render noise) */
function Spinner() {
  return (
    <div className="flex justify-center">
      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
