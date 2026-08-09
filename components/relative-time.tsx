"use client";

import { formatDate, relativeTime } from "@/lib/utils";

/**
 * Papers are fetched in the browser, so these timestamps are never server
 * rendered and cannot hydrate against a stale "now" — no effect needed.
 */
export function RelativeTime({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} title={formatDate(iso)}>
      {relativeTime(iso)}
    </time>
  );
}
