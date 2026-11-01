"use client";

import { useRouter } from "next/navigation";

export function SortSelect({
  value,
  options,
}: {
  value: string;
  options: { value: string; label: string; href: string }[];
}) {
  const router = useRouter();
  return (
    <div className="relative">
      <select
        aria-label="Sort by"
        value={value}
        onChange={(e) => {
          const option = options.find((option) => option.value === e.target.value);
          if (option) router.push(option.href);
        }}
        className="appearance-none rounded-lg border border-border bg-surface py-2 pl-3.5 pr-8 text-sm font-medium outline-none transition-colors hover:border-muted focus:border-primary focus:ring-2 focus:ring-ring"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}
