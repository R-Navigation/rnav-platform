import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RNAV_BRAND_ASSETS } from "@/lib/brand";
import "maplibre-gl/dist/maplibre-gl.css";
import "@/styles/globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_BASE_URL ?? "http://localhost:4090"),
  title: {
    default: "RNAV Lab",
    template: "%s | RNAV Lab",
  },
  description: "RNAV 实验室统一网站与管理平台",
  icons: {
    icon: [{ url: RNAV_BRAND_ASSETS.mark, type: "image/svg+xml" }],
    shortcut: RNAV_BRAND_ASSETS.mark,
  },
  openGraph: { type: "website", locale: "zh_CN", siteName: "RNAV Lab", title: "RNAV Lab", description: "RNAV 实验室统一网站与管理平台", images: ["/og-default.svg"] },
  twitter: { card: "summary_large_image", title: "RNAV Lab", description: "RNAV 实验室统一网站与管理平台", images: ["/og-default.svg"] },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "Organization", name: "RNAV Lab", url: process.env.PUBLIC_BASE_URL ?? "http://localhost:4090", description: "RNAV 实验室统一网站与管理平台" }).replace(/</g,"\\u003c") }} />
      </body>
    </html>
  );
}
