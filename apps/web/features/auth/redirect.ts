const defaultPostLoginPath = "/console";
const controlCharacters = /[\u0000-\u001f\u007f-\u009f]/;

function isSafeInternalPath(value: string) {
  let decoded = value;

  for (let pass = 0; pass < 5; pass += 1) {
    if (
      !decoded.startsWith("/") ||
      decoded.startsWith("//") ||
      decoded.includes("\\") ||
      controlCharacters.test(decoded)
    ) {
      return false;
    }

    let nextDecoded: string;
    try {
      nextDecoded = decodeURIComponent(decoded);
    } catch {
      return false;
    }

    if (nextDecoded === decoded) {
      return true;
    }
    decoded = nextDecoded;
  }

  return false;
}

export function normalizePostLoginPath(value: string | string[] | undefined) {
  const candidate = Array.isArray(value)
    ? value.length === 1
      ? value[0]
      : undefined
    : value;

  return candidate && isSafeInternalPath(candidate)
    ? candidate
    : defaultPostLoginPath;
}
