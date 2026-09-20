import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Multi-Agent Orchestrator",
  description: "Claude와 Codex에 같은 요청을 보내 결과를 나란히 비교한다",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-zinc-900 dark:bg-black dark:text-zinc-100">
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <nav className="mx-auto flex w-full max-w-5xl items-center gap-4 px-6 py-3 text-sm font-medium">
            <Link href="/" className="text-zinc-900 hover:underline dark:text-zinc-100">
              새 요청
            </Link>
            <Link href="/tasks" className="text-zinc-600 hover:underline dark:text-zinc-400">
              작업 목록
            </Link>
          </nav>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
