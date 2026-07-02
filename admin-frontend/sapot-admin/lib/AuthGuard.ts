'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function useAuthGuard(token: string | null) {
  const router = useRouter();

  useEffect(() => {
    if (!token) {
      router.replace('/');
    }
  }, [token, router]);
}
