export type PublicMonitorPreview = {
  summary: { statusText: string; onlineCount: number; totalCount: number };
  devices: Array<{ code: string; displayName: string; isOnline: boolean; statusLabel: string }>;
};

const emptyPreview: PublicMonitorPreview = { summary: { statusText: "", onlineCount: 0, totalCount: 0 }, devices: [] };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function sanitizeMonitorPreview(value: unknown): PublicMonitorPreview {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyPreview;
  const source = record(value);
  const summary = record(source.summary);
  const devices = Array.isArray(source.devices) ? source.devices : [];
  const onlineCount = summary.onlineCount ?? summary.onlineDeviceCount;
  const totalCount = summary.totalCount ?? summary.totalDeviceCount;
  return {
    summary: {
      statusText: String(summary.statusText ?? "").trim(),
      onlineCount: Number.isFinite(Number(onlineCount)) ? Number(onlineCount) : 0,
      totalCount: Number.isFinite(Number(totalCount)) ? Number(totalCount) : devices.length
    },
    devices: devices.slice(0, 6).map((value) => {
      const device = record(value);
      const currentState = record(device.currentState);
      const heartbeatIntegrity = record(currentState.heartbeatIntegrity);
      return {
        code: String(device.code ?? "").trim(),
        displayName: String(device.displayName ?? device.name ?? "").trim(),
        isOnline: Boolean(device.isOnline ?? currentState.isOnline),
        statusLabel: String(device.statusLabel ?? heartbeatIntegrity.label ?? "").trim()
      };
    }).filter((device) => device.code || device.displayName)
  };
}
