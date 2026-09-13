"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { consoleApi } from "@/lib/consoleApi";
import {
  resolveHeroImage,
  type HeroImage,
} from "@/features/public-site/ui4/hero-image";

export function HeaderImageEditor({
  pageKey,
  value,
  onChange,
}: {
  pageKey: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const page =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as {
          hero?: { image?: HeroImage };
          header?: { image?: HeroImage };
          directionsHeroImage?: HeroImage;
        })
      : {};
  const home = pageKey === "home";
  const field = home ? "hero" : "header";
  return (
    <div className="mb-6 grid gap-4">
      <ImageField
        title="本页顶部照片"
        image={page[field]?.image}
        onChange={(image) =>
          onChange({ ...page, [field]: { ...page[field], image } })
        }
      />
      {home && (
        <ImageField
          title="研究方向页面顶部照片"
          image={page.directionsHeroImage}
          onChange={(image) =>
            onChange({ ...page, directionsHeroImage: image })
          }
        />
      )}
    </div>
  );
}

function ImageField({
  title,
  image,
  onChange,
}: {
  title: string;
  image?: HeroImage;
  onChange: (image: HeroImage | null) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [failed, setFailed] = useState("");
  const currentChange = useRef(onChange),
    active = useRef(true);
  useEffect(() => {
    currentChange.current = onChange;
  }, [onChange]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const preview = resolveHeroImage(image);
  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const asset = await consoleApi<{ id: string; url: string }>(
        "/api/media/upload",
        { method: "POST", body },
      );
      if (active.current)
        currentChange.current({
          assetId: asset.id,
          src: asset.url,
          alt: image?.alt || title,
        });
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }
  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <h3 className="font-semibold text-blue-950">{title}</h3>
      <p className="mt-1 text-xs leading-6 text-slate-600">
        单张横向照片，建议 1600 × 900
        像素。留空使用默认校园风景图；上传或修改后需保存当前页面才会公开生效。
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-[180px_1fr]">
        <div className="relative aspect-video self-start overflow-hidden rounded bg-slate-200">
          {failed !== preview.src ? (
            <Image
              loading="eager"
              unoptimized
              fill
              src={preview.src}
              alt={preview.alt || title}
              className="object-cover"
              onError={() => setFailed(preview.src)}
            />
          ) : (
            <span className="p-3 text-xs">图片暂时无法加载</span>
          )}
        </div>
        <div className="grid gap-3">
          <label className="text-xs text-slate-700">
            图片地址
            <input
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              type="url"
              value={image?.src ?? ""}
              onChange={(event) =>
                onChange({ ...image, assetId: null, src: event.target.value })
              }
            />
          </label>
          <label className="text-xs text-slate-700">
            图片说明
            <input
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={image?.alt ?? ""}
              onChange={(event) =>
                onChange({ ...image, alt: event.target.value })
              }
            />
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <label className="cursor-pointer rounded bg-blue-950 px-3 py-2 text-xs font-semibold text-white">
              {busy ? "上传中…" : "上传照片"}
              <input
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={upload}
              />
            </label>
            <button
              type="button"
              className="text-xs text-slate-600 underline"
              disabled={busy}
              onClick={() => onChange(null)}
            >
              恢复默认照片
            </button>
          </div>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
