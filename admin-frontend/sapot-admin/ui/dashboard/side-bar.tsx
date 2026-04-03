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

export default function SideBar() {
	const iconSize = 36;
	const menuItems = [
    { icon: <LayoutDashboard size={18} />, label: 'Dashboard', href: '/dashboard' },
    { icon: <LineChart size={18} />, label: 'Network Analytics', href: '/dashboard/analytics' },
    { icon: <Users size={18} />, label: 'Users', href: '/dashboard/users' },
    { icon: <MessageSquare size={18} />, label: 'Messages', href: '/dashboard/messages' },
    { icon: <Share2 size={18} />, label: 'Node Mapping', href: '/dashboard/nodes' },
    { icon: <History size={18} />, label: 'Logs', href: '/dashboard/logs', active: true },
    { icon: <Smartphone size={18} />, label: 'GSM Management', href: '/dashboard/gsm' },
    { icon: <Megaphone size={18} />, label: 'Announcements', href: '/dashboard/announcements' },
    { icon: <Settings size={18} />, label: 'Settings', href: '/dashboard/settings' },
  ];
	return (
				<aside className="w-64 bgwhite flex flex-col border-r border-gray-200 h-screen border rounded-tr-4xl shadow-lg">
					{/* Navigation Links */}
					<nav className="flex-1 px-4 space-y-1 overflow-y-auto">
						{menuItems.map((item) => (
							<a
								key={item.label}
								href={item.href}
								className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm font-custom-color`}
							>
								{item.icon}
								{item.label}
							</a>
						))}
					</nav>
				</aside>
	)
}
