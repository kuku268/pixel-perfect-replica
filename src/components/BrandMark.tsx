"use client";

import Link from "next/link";

// Logo lockup used in every header: a small forest-green tile + the product name.
// `to` makes it a link (auth pages link back home); omit it for a static label.
export function BrandMark({ to, className = "" }: { to?: string; className?: string }) {
  const content = (
    <>
      <span
        aria-hidden="true"
        className="inline-block size-7 rounded-lg bg-primary shadow-[inset_0_1px_0_oklch(1_0_0/0.25)]"
      />
      <span className="text-base font-semibold tracking-tight text-foreground">
        Video Speed Reader
      </span>
    </>
  );
  const classes = `inline-flex items-center gap-2.5 ${className}`;
  return to ? (
    <Link href={to} className={classes}>
      {content}
    </Link>
  ) : (
    <span className={classes}>{content}</span>
  );
}
