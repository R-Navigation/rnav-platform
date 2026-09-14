import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { LoginForm } from "@/features/auth/LoginForm";
import { normalizePostLoginPath } from "@/features/auth/redirect";
import { RNAV_BRAND_ASSETS } from "@/lib/brand";

type LoginPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

async function LoginContent({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = normalizePostLoginPath(params.next);

  return (
    <main className="grid min-h-screen place-items-center bg-surface px-5 py-12">
      <section className="w-full max-w-md border-t-4 border-cyan-600 bg-white px-6 py-8 shadow-sm sm:px-9">
        <Link aria-label="RNAV 首页" className="inline-flex" href="/">
          <Image
            alt="RNAV — Resilient Navigation"
            className="h-auto w-40"
            height={63}
            priority
            src={RNAV_BRAND_ASSETS.horizontal}
            unoptimized
            width={160}
          />
        </Link>
        <h1 className="mt-8 font-serif text-3xl font-bold text-slate-950">控制台登录</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">使用实验室统一账号继续。</p>
        <LoginForm nextPath={nextPath} />
      </section>
    </main>
  );
}

function LoginFallback() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="grid min-h-screen place-items-center bg-surface px-5 py-12"
    >
      <p className="text-sm font-semibold text-slate-600">登录页面加载中</p>
    </main>
  );
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}
