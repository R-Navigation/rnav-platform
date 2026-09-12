import type { ButtonHTMLAttributes, ReactNode } from "react";

const variants = {
  primary: "border-cyan-700 bg-cyan-700 text-white hover:border-cyan-800 hover:bg-cyan-800",
  secondary: "border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50",
  ghost: "border-transparent bg-transparent text-slate-700 hover:bg-slate-100",
  danger: "border-red-200 bg-white text-red-700 hover:bg-red-50",
};

export function ConsoleButton({ className = "", variant = "secondary", size = "md", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants; size?: "sm" | "md"; children: ReactNode }) {
  return <button className={`inline-flex items-center justify-center gap-2 rounded-lg border font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${size === "sm" ? "min-h-8 px-3 text-xs" : "min-h-10 px-4 text-sm"} ${variants[variant]} ${className}`} {...props}>{children}</button>;
}
