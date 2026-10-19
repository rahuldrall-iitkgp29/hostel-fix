import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/layout/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "HostelFix — A better place to live", template: "%s | HostelFix" },
  description: "A simpler way to report hostel maintenance, follow each update, and bring students, staff, and hostel administrators together.",
  applicationName: "HostelFix",
};

export const viewport: Viewport = { themeColor: "#f8f9f4" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to content</a><Providers>{children}</Providers></body></html>;
}
