type ConsolePlaceholderProps = {
  description: string;
  title: string;
};

export function ConsolePlaceholder({ description, title }: ConsolePlaceholderProps) {
  return (
    <section aria-labelledby="console-page-heading">
      <p className="text-sm font-semibold text-cyan-700">控制台模块</p>
      <h1 id="console-page-heading" className="mt-2 font-serif text-3xl font-bold text-slate-950">
        {title}
      </h1>
      <div className="mt-8 border-l-2 border-cyan-600 bg-white px-5 py-4 text-sm leading-7 text-slate-600">
        {description}
      </div>
    </section>
  );
}
