import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

/**
 * Geist Sans và Geist Mono — hai mặt chữ, không có mặt thứ ba.
 * Xem docs/design/vercel-geist.md §4.
 */
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "vietnamese"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin", "vietnamese"] });

export const metadata: Metadata = {
  title: "bee",
  description: "Where PM and Techlead work with the agent",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // Dark là mặc định (17/08) — theo Claude Code trong VSCode. Token sáng
      // vẫn nguyên trong globals.css; bỏ class `dark` là quay lại.
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-body">{children}</body>
    </html>
  );
}
