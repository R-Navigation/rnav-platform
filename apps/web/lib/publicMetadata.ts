import type { Metadata } from "next";

const image = "/og-default.svg";

export function publicMetadata(title: string, description: string, path: string): Metadata {
  const fullTitle = path === "/" ? "RNAV Lab" : `${title} | RNAV Lab`;
  return {
    title: path === "/" ? { absolute: fullTitle } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "zh_CN",
      siteName: "RNAV Lab",
      title: fullTitle,
      description,
      url: path,
      images: [image],
    },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [image] },
  };
}
