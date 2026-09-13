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

export function imagePresentation(
  image?: HeroImage | null,
  fallback: { positionX?: number; positionY?: number; zoom?: number } = {},
) {
  const safe = (
    value: unknown,
    defaultValue: number,
    min: number,
    max: number,
  ) =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.min(max, Math.max(min, value))
      : defaultValue;
  return {
    positionX: safe(image?.positionX, fallback.positionX ?? 50, 0, 100),
    positionY: safe(image?.positionY, fallback.positionY ?? 50, 0, 100),
    zoom: safe(image?.zoom, fallback.zoom ?? 1, 1, 2),
  };
}
export function resolveHeroImage(
  ...images: (HeroImage | null | undefined)[]
): HeroImage & { src: string } {
  return (images.find(
    (image) =>
      sanitizePublicUrl(image?.src) &&
      !/示意|demo|example/i.test(image?.alt ?? ""),
  ) || defaultHeroImage) as HeroImage & { src: string };
}
