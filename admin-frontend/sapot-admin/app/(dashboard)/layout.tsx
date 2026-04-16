
import NavBar from "@/ui/dashboard/nav-bar";
import SideBar from "@/ui/dashboard/side-bar";
import { Bell, UserCircle } from "lucide-react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Admin Dashboard",
  description: "Welcome to the admin dashboard",
};

export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
      <section className="min-h-full flex flex-col">
				<NavBar />
				<main className="pt-2 flex  gap-2">
					<SideBar />
						<section className="flex-1 overflow-y-auto p-2">
							<div className="h-full w-full p-2 bg-white rounded-4xl border border-gray-200 shadow-sm overflow-hidden">
								{children}
							</div>
						</section>
						</main>
			</section>
  );
}
