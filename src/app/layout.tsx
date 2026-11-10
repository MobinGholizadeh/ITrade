import type { Metadata } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";
import { Shell } from "@/components/shell";
import "./globals.css";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
  display: "swap",
});
const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-roboto-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ITrade · Crypto research workspace",
    template: "%s · ITrade",
  },
  description:
    "A personal, read-only cryptocurrency research and monitoring workspace.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${roboto.variable} ${robotoMono.variable}`}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
