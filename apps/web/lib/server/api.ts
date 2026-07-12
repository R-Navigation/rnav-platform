import "server-only";

const defaultInternalApiUrl = "http://127.0.0.1:4090";

export function getInternalApiUrl(pathname: string) {
  const baseUrl = process.env.RNAV_API_INTERNAL_URL ?? defaultInternalApiUrl;
  return new URL(pathname, baseUrl);
}
