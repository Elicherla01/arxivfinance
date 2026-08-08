import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "q-fin Digest · arXiv Quantitative Finance",
  description:
    "Latest arXiv Quantitative Finance papers, summarized by subject class: computational finance, mathematical finance, portfolio management, risk, trading and market microstructure.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
