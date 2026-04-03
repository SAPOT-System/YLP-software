'use client';

import clsx from 'clsx';
import { 
  LayoutDashboard, 
  LineChart, 
  Users, 
  MessageSquare, 
  Share2, 
  History, 
  Smartphone, 
  Megaphone, 
  Settings,
  Bell,
  UserCircle
} from 'lucide-react'; // Standard lucide icons
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function SideBar() {
	const iconSize = 16;
	const pathname = usePathname();
	const menuItems = [
    { icon: <LayoutDashboard size={iconSize} />, label: 'Dashboard', href: '/dashboard' },
    { icon: <LineChart size={iconSize} />, label: 'Network Analytics', href: '/analytics' },
    { icon: <Users size={iconSize} />, label: 'Users', href: '/users' },
    { icon: <MessageSquare size={iconSize} />, label: 'Messages', href: '/messages' },
    { icon: <Share2 size={iconSize} />, label: 'Node Mapping', href: '/nodes' },
    { icon: <History size={iconSize} />, label: 'Logs', href: '/logs', active: true },
    { icon: <Smartphone size={iconSize} />, label: 'GSM Management', href: '/gsm' },
    { icon: <Megaphone size={iconSize} />, label: 'Announcements', href: '/announcements' },
    { icon: <Settings size={iconSize} />, label: 'Settings', href: '/settings' },
  ];
	return (
				<aside className="w-64 bg-white flex flex-col border-r border-gray-200 h-screen border rounded-tr-4xl shadow-lg">
					{/* Navigation Links */}
					<nav className="flex-1 px-4 space-y-1 overflow-y-auto">
							<div className={`flex items-center font-bold gap-3 px-4 py-8 rounded-xl transition-all text-sm`}></div>
						{menuItems.map((item) => (
							<Link
								key={item.label}
								href={item.href}
								className={ clsx(
										`flex items-center font-bold gap-3 px-4 py-3 rounded-xl transition-all text-sm`,
										{
											'bg-blue-500 text-white': pathname === item.href,
										},
										{
											'font-custom-color': pathname !== item.href,
										}
									)
								}
							>
								{item.icon}
									{item.label}
							</Link>
						))}
					</nav>
				</aside>
	)
}
