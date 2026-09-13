import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  const base=(process.env.PUBLIC_BASE_URL??"http://localhost:4090").replace(/\/$/,"");
  return ["","/directions","/research","/facilities","/team","/news","/monitor","/contact"].map((path)=>({url:`${base}${path}`,changeFrequency:path===""?"weekly":"monthly",priority:path===""?1:0.7}));
}
