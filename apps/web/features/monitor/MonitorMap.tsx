"use client";

import { useEffect, useRef, useState } from "react";
import type { MonitorDevice, MonitorSnapshot } from "./model";
import { shouldSyncMarkers } from "./realtime";

export function MonitorMap({ devices, onSelect, selectedKey, settings }: { devices: MonitorDevice[]; onSelect: (key: string) => void; selectedKey: string; settings: MonitorSnapshot["settings"] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const markersRef = useRef<import("maplibre-gl").Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let active = true;
    void import("maplibre-gl").then((maplibregl) => {
      if (!active || !containerRef.current || mapRef.current) return;
      const map = new maplibregl.Map({
        container: containerRef.current,
        center: [settings.defaultCenterLng, settings.defaultCenterLat],
        zoom: settings.defaultZoom,
        attributionControl: false,
        style: { version: 8, sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "OpenStreetMap" } }, layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.72, "raster-brightness-max": 0.55 } }] },
      });
      mapRef.current=map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      setMapReady(true);
    });
    return () => {
      active = false;
      setMapReady(false);
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [settings.defaultCenterLat, settings.defaultCenterLng, settings.defaultZoom]);

  useEffect(() => {
    if (!shouldSyncMarkers(mapReady) || !mapRef.current) return;
    let active = true;
    void import("maplibre-gl").then((maplibregl) => {
      if (!active || !mapRef.current) return;
      markersRef.current.forEach((marker) => marker.remove()); markersRef.current = [];
      for (const device of devices) {
        const { lat, lng } = device.currentState.geoState; if (lat === null || lng === null) continue;
        const key = device.id || device.code; const element = document.createElement("button"); element.type = "button"; element.title = device.displayName; element.setAttribute("aria-label", `选择 ${device.displayName}，当前${device.currentState.isOnline ? "在线" : "离线"}`);
        element.className = `grid h-11 w-11 place-items-center rounded-full bg-transparent ${key === selectedKey ? "ring-2 ring-cyan-300" : ""}`;
        const dot = document.createElement("span");
        dot.className = `block h-4 w-4 rounded-full border-2 border-white shadow ${device.currentState.isOnline ? "bg-emerald-500" : "bg-slate-500"}`;
        element.append(dot);
        element.onclick = () => onSelect(key);
        markersRef.current.push(new maplibregl.Marker({ element }).setLngLat([lng, lat]).addTo(mapRef.current!));
      }
    });
    return () => { active = false; };
  }, [devices, mapReady, onSelect, selectedKey]);

  return <div className="h-full min-h-80 w-full bg-slate-900" ref={containerRef} />;
}
