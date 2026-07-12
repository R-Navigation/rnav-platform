import Link from "next/link";

type ConsoleStateProps = {
  description: string;
  title: string;
};

export function ConsoleState({ description, title }: ConsoleStateProps) {
  return (
    <main className="grid min-h-screen place-items-center bg-surface px-5 py-12">
      <section className="w-full max-w-xl border-t-4 border-cyan-600 bg-white p-8 shadow-sm">
        <p className="text-sm font-bold text-cyan-700">RNAV CONSOLE</p>
        <h1 className="mt-4 font-serif text-3xl font-bold text-slate-950">{title}</h1>
        <p className="mt-4 leading-7 text-slate-600">{description}</p>
        <Link className="mt-7 inline-block font-semibold text-cyan-800 underline" href="/">
          返回网站首页
        </Link>
      </section>
    </main>
  );
}
