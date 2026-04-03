
import NavBar from "@/ui/dashboard/nav-bar";
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

export default function HomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
      <section className="min-h-full flex flex-col">
				<NavBar />
				<main className="pt-4">
					
					{children}
				</main>
			</section>
  );
}
