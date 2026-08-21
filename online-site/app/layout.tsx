import type { Metadata } from "next";
import { AppHeader } from "../components/AppHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shipowner Invoice Manager",
  description: "Online shipowner invoice, vessel and container workflow manager.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><AppHeader />{children}</body></html>;
}
