import { sanitizePublicUrl } from "../url-sanitizer.ts";

export const defaultHeroImage = {
  src: "https://liesmars.whu.edu.cn/images/202501233.png",
  alt: "武汉大学校园风景 · Wuhan University campus · 来源 LIESMARS",
};

export type HeroImage = {
  src?: string;
  alt?: string;
  assetId?: string | null;
  positionX?: number;
  positionY?: number;
  zoom?: number;
};
export function resolveHeroImage(
  ...images: (HeroImage | null | undefined)[]
): HeroImage & { src: string } {
  return (images.find(
    (image) =>
      sanitizePublicUrl(image?.src) &&
      !/示意|demo|example/i.test(image?.alt ?? ""),
  ) || defaultHeroImage) as HeroImage & { src: string };
}
