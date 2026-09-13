import sharp from "sharp";

const origin = "https://r-navigation-1326672316.cos.ap-beijing.myqcloud.com";
const widths = new Set([
  16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048,
  3840,
]);
const maxSourceBytes = 16 * 1024 * 1024;
export class PublicImageError extends Error {
  constructor(public status: number) {
    super("Public image unavailable");
  }
}
export function isOwnedPublicImage(src: unknown): src is string {
  if (typeof src !== "string" || src.length > 2048) return false;
  try {
    const url = new URL(src);
    return (
      url.origin === origin &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname.startsWith("/rnav/")
    );
  } catch {
    return false;
  }
}
export function collectPublishedImages(
  value: unknown,
  result = new Set<string>(),
): Set<string> {
  if (Array.isArray(value))
    value.forEach((item) => collectPublishedImages(item, result));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "src" && isOwnedPublicImage(item)) result.add(item);
      else if (item && typeof item === "object")
        collectPublishedImages(item, result);
    }
  }
  return result;
}

// Only an exact, currently published URL in our fixed COS bucket can be fetched.
// Tencent's same-region private DNS is expected here; no caller controls the host,
// credentials, headers or redirects. Next's general SSRF safeguards remain enabled.
export function createPublicImageService(
  loadPublished: () => Promise<unknown>,
  fetchImage: typeof fetch = fetch,
) {
  let published: Set<string> | undefined;
  let publishedUntil = 0;
  let refresh: Promise<void> | undefined;
  const cache = new Map<string, { bytes: Buffer; until: number }>();
  const pending = new Map<string, Promise<Buffer>>();
  const waiters: Array<() => void> = [];
  let active = 0,
    cachedBytes = 0;
  async function allowlist() {
    if (published && Date.now() < publishedUntil) return published;
    if (!refresh)
      refresh = loadPublished()
        .then((value) => {
          published = collectPublishedImages(value);
          publishedUntil = Date.now() + 30_000;
        })
        .finally(() => {
          refresh = undefined;
        });
    await refresh;
    return published!;
  }
  return async (src: unknown, width: unknown) => {
    if (
      !isOwnedPublicImage(src) ||
      typeof width !== "string" ||
      !/^\d{1,4}$/.test(width) ||
      !widths.has(Number(width))
    )
      throw new PublicImageError(400);
    if (!(await allowlist()).has(src)) throw new PublicImageError(404);
    const key = `${src}:${width}`,
      hit = cache.get(key);
    if (hit && hit.until > Date.now()) return hit.bytes;
    const inflight = pending.get(key);
    if (inflight) return inflight;
    if (pending.size >= 16) throw new PublicImageError(503);
    const request = (async () => {
      if (active >= 4)
        await new Promise<void>((resolve) => waiters.push(resolve));
      else active++;
      try {
        const response = await fetchImage(src, {
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
          headers: { Accept: "image/jpeg,image/png,image/webp,image/avif" },
        });
        if (
          !response.ok ||
          !/^image\/(jpeg|png|webp|avif)(?:;|$)/i.test(
            response.headers.get("content-type") || "",
          ) ||
          Number(response.headers.get("content-length")) > maxSourceBytes ||
          !response.body
        ) {
          await response.body?.cancel();
          throw new PublicImageError(502);
        }
        const reader = response.body.getReader(),
          chunks: Uint8Array[] = [];
        let size = 0;
        try {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > maxSourceBytes) throw new PublicImageError(413);
            chunks.push(chunk.value);
          }
        } finally {
          await reader.cancel();
        }
        const input = Buffer.concat(chunks);
        const raster =
          input
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
          (input[0] === 255 && input[1] === 216 && input[2] === 255) ||
          (input.toString("ascii", 0, 4) === "RIFF" &&
            input.toString("ascii", 8, 12) === "WEBP") ||
          (input.toString("ascii", 4, 8) === "ftyp" &&
            /^(avif|avis)$/.test(input.toString("ascii", 8, 12)));
        if (!raster) throw new PublicImageError(415);
        const bytes = await sharp(input, {
          limitInputPixels: 32_000_000,
        })
          .rotate()
          .resize({
            width: Math.min(Number(width), 1920),
            withoutEnlargement: true,
          })
          .webp({ quality: 78 })
          .toBuffer();
        if (bytes.length > 4 * 1024 * 1024) throw new PublicImageError(413);
        if (hit) {
          cache.delete(key);
          cachedBytes -= hit.bytes.length;
        }
        while (
          cache.size >= 64 ||
          cachedBytes + bytes.length > 24 * 1024 * 1024
        ) {
          const oldest = cache.keys().next().value;
          if (!oldest) break;
          cachedBytes -= cache.get(oldest)!.bytes.length;
          cache.delete(oldest);
        }
        cache.set(key, { bytes, until: Date.now() + 3_600_000 });
        cachedBytes += bytes.length;
        return bytes;
      } finally {
        const next = waiters.shift();
        if (next) next();
        else active--;
      }
    })().finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  };
}
