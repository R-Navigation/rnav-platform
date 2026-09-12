import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  const base=(process.env.PUBLIC_BASE_URL??"http://localhost:4090").replace(/\/$/,"");
  return { rules: { userAgent: "*", allow: "/", disallow: ["/console/","/api/","/login"] }, sitemap: `${base}/sitemap.xml` };
}
