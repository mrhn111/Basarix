import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import ThemeProvider from "@/components/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Başarıx",
  description: "Akıllı sınav takip ve çalışma öneri uygulaması",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-gradient-to-br from-[#f6fbfb] via-[#f3f8fa] to-[#f5f9fc] dark:from-[#0a0e0d] dark:via-[#0c1110] dark:to-[#0a0e0d] text-zinc-900 dark:text-zinc-100 overflow-x-hidden relative">
        <ThemeProvider />
        <div aria-hidden className="fixed -z-10 pointer-events-none top-[-20%] left-[-20%] w-[65vw] h-[65vw] rounded-full bg-[#0f766e]/15 dark:bg-[#0f766e]/8 blur-3xl" />
        <div aria-hidden className="fixed -z-10 pointer-events-none bottom-[-15%] left-[-10%] w-[55vw] h-[55vw] rounded-full bg-[#0f766e]/18 dark:bg-[#0f766e]/10 blur-3xl" />
        <div aria-hidden className="fixed -z-10 pointer-events-none top-[25%] right-[-15%] w-[50vw] h-[50vw] rounded-full bg-sky-400/20 dark:bg-sky-400/8 blur-3xl" />
        {children}
      </body>
    </html>
  );
}
