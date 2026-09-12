export function ConsoleSkeleton({ className = "h-4 w-full" }: { className?: string }) { return <span aria-hidden="true" className={`block animate-pulse rounded-md bg-slate-200 ${className}`} />; }
