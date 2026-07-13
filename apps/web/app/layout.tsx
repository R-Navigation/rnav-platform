import type { Metadata } from "next";
import type { ReactNode } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: {
    default: "RNAV Lab",
    template: "%s | RNAV Lab",
  },
  description: "RNAV 实验室统一网站与管理平台",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
