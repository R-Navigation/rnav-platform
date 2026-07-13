"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadMonitorSnapshot } from "./api";
import { applyMonitorMessage, type MonitorSnapshot } from "./model";
import { getLoadFailureState, shouldClearSnapshot, shouldConnectRealtime } from "./realtime";

export function useMonitorData(scope: "public" | "console", permissions: string[] = []) {
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [connection, setConnection] = useState<"connecting" | "connected" | "polling">("connecting");
  const [error, setError] = useState("");
  const retries = useRef(0);
  const snapshotRef = useRef(snapshot);
  const connectionRef = useRef(connection);
  useEffect(() => { connectionRef.current = connection; }, [connection]);
  useEffect(() => { snapshotRef.current = snapshot; }, [snapshot]);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setStatus("loading");
    try { const next = await loadMonitorSnapshot(scope); setSnapshot(next); setStatus("ready"); setError(""); return next; }
    catch (caught) {
      const responseStatus = caught instanceof Error ? (caught as Error & { status?: number }).status : undefined;
      if (shouldClearSnapshot(scope, responseStatus)) {
        snapshotRef.current = null;
        setSnapshot(null);
      }
      setStatus(getLoadFailureState({ quiet, hasSnapshot: snapshotRef.current !== null }));
      setError(caught instanceof Error ? caught.message : "监控服务暂时不可用。");
      return null;
    }
  }, [scope]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (status !== "ready" || !shouldConnectRealtime(scope, permissions)) return;
    let closed = false; let socket: WebSocket | null = null; let reconnectTimer = 0; let pingTimer = 0;
    const connect = () => {
      if (closed) return;
      setConnection("connecting");
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${location.host}${scope === "console" ? "/ws/console" : "/ws"}`);
      socket.onopen = () => { retries.current = 0; setConnection("connected"); void refresh(true); pingTimer = window.setInterval(() => socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: "ping" })), 20_000); };
      socket.onmessage = (event) => { try { const message = JSON.parse(event.data); setSnapshot((current) => current ? applyMonitorMessage(current, message) : current); } catch { /* Ignore malformed frames. */ } };
      socket.onclose = () => { window.clearInterval(pingTimer); if (closed) return; setConnection("polling"); reconnectTimer = window.setTimeout(connect, Math.min(1_000 * 2 ** retries.current++, 10_000)); };
      socket.onerror = () => setConnection("polling");
    };
    connect();
    let pollTimer = 0;
    const schedulePoll = () => { pollTimer = window.setTimeout(() => { void refresh(true).finally(schedulePoll); }, connectionRef.current === "connected" ? 30_000 : 5_000); };
    schedulePoll();
    return () => { closed = true; window.clearTimeout(reconnectTimer); window.clearInterval(pingTimer); window.clearTimeout(pollTimer); socket?.close(); };
  }, [permissions, refresh, scope, status]);

  return { connection, error, refresh, snapshot, status };
}
