"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type LoginFormProps = {
  nextPath: string;
};

export function LoginForm({ nextPath }: LoginFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: formData.get("username"),
          password: formData.get("password"),
        }),
      });

      if (!response.ok) {
        setError(response.status === 401 ? "用户名或密码错误。" : "登录服务暂时不可用，请稍后重试。");
        return;
      }

      router.replace(nextPath);
      router.refresh();
    } catch {
      setError("无法连接登录服务，请稍后重试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
      <div>
        <label className="block text-sm font-semibold text-slate-800" htmlFor="username">
          用户名
        </label>
        <input
          autoComplete="username"
          className="mt-2 w-full border border-slate-300 bg-white px-3 py-3 text-slate-950 shadow-sm outline-none transition-colors focus:border-cyan-700"
          id="username"
          name="username"
          required
          type="text"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-slate-800" htmlFor="password">
          密码
        </label>
        <input
          autoComplete="current-password"
          className="mt-2 w-full border border-slate-300 bg-white px-3 py-3 text-slate-950 shadow-sm outline-none transition-colors focus:border-cyan-700"
          id="password"
          name="password"
          required
          type="password"
        />
      </div>
      {error ? (
        <p className="border-l-2 border-red-600 pl-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="w-full bg-blue-950 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-cyan-800 disabled:cursor-wait disabled:bg-slate-500"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "正在登录…" : "登录控制台"}
      </button>
    </form>
  );
}
