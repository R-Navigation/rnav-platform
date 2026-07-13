export function getLoadFailureState({ quiet, hasSnapshot }: { quiet: boolean; hasSnapshot: boolean }) {
  return quiet && hasSnapshot ? "ready" : "error";
}

export function shouldSyncMarkers(mapReady: boolean) {
  return mapReady;
}
