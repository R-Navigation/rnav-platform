import type { ReactNode } from "react";
export function Icon({
  name,
  className = "h-5 w-5",
}: {
  name: string;
  className?: string;
}) {
  const paths: Record<string, ReactNode> = {
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 6 9 7 9-7" />
      </>
    ),
    location_on: (
      <>
        <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    content_copy: (
      <>
        <rect x="8" y="8" width="12" height="13" rx="2" />
        <path d="M16 8V3H4v13h4" />
      </>
    ),
    groups: (
      <>
        <circle cx="9" cy="7" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5v2" />
      </>
    ),
    school: (
      <>
        <path d="m2 8 10-5 10 5-10 5-10-5Zm4 2v7c4 3 8 3 12 0v-7m4-2v9" />
      </>
    ),
    science: (
      <>
        <path d="M9 3h6m-5 0v7L4 20h16l-6-10V3M7 15h10" />
      </>
    ),
    arrow: (
      <>
        <path d="M4 12h16m-6-6 6 6-6 6" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name] || paths.arrow}
    </svg>
  );
}
