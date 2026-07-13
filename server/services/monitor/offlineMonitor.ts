type OfflineService = { markOfflineDevices(seconds: number): Promise<{ count: number }> };

type Options = {
  service: OfflineService;
  offlineTimeoutSeconds: number;
  intervalMs?: number;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  onError?: (error: unknown) => void;
};

export function startOfflineMonitor({
  service,
  offlineTimeoutSeconds,
  intervalMs = 5_000,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  onError = (error) => console.error("Offline monitor failed:", error),
}: Options) {
  let running = false;
  const sweep = () => {
    if (running) return;
    running = true;
    void service.markOfflineDevices(offlineTimeoutSeconds).catch(onError).finally(() => { running = false; });
  };
  sweep();
  const timer = setIntervalFn(sweep, intervalMs);
  timer.unref?.();
  return () => clearIntervalFn(timer);
}
