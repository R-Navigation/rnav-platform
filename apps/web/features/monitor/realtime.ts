export function getLoadFailureState({ quiet, hasSnapshot }: { quiet: boolean; hasSnapshot: boolean }) {
  return quiet && hasSnapshot ? "ready" : "error";
}

export function shouldSyncMarkers(mapReady: boolean) {
  return mapReady;
}

export function shouldClearSnapshot(scope: "public" | "console", status: number | undefined) {
  return scope === "console" && (status === 401 || status === 403);
}

export function shouldConnectRealtime(scope: "public" | "console", permissions: string[]) {
  return scope === "public" || permissions.includes("monitor.devices.read") || permissions.includes("monitor.devices.write");
}
