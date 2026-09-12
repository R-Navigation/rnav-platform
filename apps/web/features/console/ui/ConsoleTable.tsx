import type { HTMLAttributes, TableHTMLAttributes } from "react";
export function ConsoleTableWrap({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={`overflow-x-auto rounded-xl border border-slate-200 bg-white ${className}`} {...props}/>; }
export function ConsoleTable({ className = "", ...props }: TableHTMLAttributes<HTMLTableElement>) { return <table className={`w-full min-w-[42rem] border-collapse text-left text-sm ${className}`} {...props}/>; }
