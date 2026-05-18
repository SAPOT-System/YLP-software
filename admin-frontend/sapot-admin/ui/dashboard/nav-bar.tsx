'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { logout } from '@/actions/auth'; // adjust path if needed

import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';


export default function NavBar() {
  const iconSize = 36;
  const logoSize = 42;

	const [loggingOut, setLoggingOut] = useState(false);
	const router = useRouter();

	const handleLogout = async () => {
		setOpen(false);
		setLoggingOut(true);

		try {
			const res = await fetch('/api/logout', {
				method: 'POST',
			});

			if (!res.ok) {
				console.error('Logout failed');
				setLoggingOut(false);
				return;
			}


			db.close();
			await  db.delete();

			router.push('/');
			router.refresh();
		} catch (err) {
			console.error('Logout error:', err);
			setLoggingOut(false);
		}
	};

  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="w-full px-4 py-2 flex justify-between shadow-lg relative">

      {/* Logo */}
      <Link href="/dashboard" className="flex items-center gap-2 font-bold text-xl">
        <Image
          src="/logos/logo.png"
          alt="SAPOT logo"
          width={logoSize}
          height={logoSize}
        />
        <span className="font-custom-color">SAPOT</span>
      </Link>

      {/* Right side */}
      <div className="flex items-center gap-3 relative">

        {/* Profile dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setOpen((prev) => !prev)}
            className="flex items-center"
          >
            <Image
              src="/icons/profile_icon.png"
              alt="profile"
              width={iconSize}
              height={iconSize}
            />
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50">

						{/*<Link */}
						{/*href="/profile" */}
						{/*className="block px-4 py-2 text-sm hover:bg-gray-100" */}
						{/*onClick={() => setOpen(false)} */}
						{/*> */}
						{/*Profile */}
						{/*</Link> */}

              <Link
                href="/settings"
                className="block px-4 py-2 text-sm hover:bg-gray-100"
                onClick={() => setOpen(false)}
              >
                Settings
              </Link>

							<button
								onClick={handleLogout}
								className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
							>
								Logout
							</button>

            </div>
          )}
        </div>
      </div>
		{loggingOut && (
			<div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100]">
				<div className="bg-white px-6 py-5 rounded-xl shadow-lg flex flex-col items-center gap-3">
					
					{/* simple spinner */}
					<div className="w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />

					<p className="text-sm font-medium text-gray-700">
						Logging you out...
					</p>

				</div>
			</div>
		)}
    </div>
  );
}
