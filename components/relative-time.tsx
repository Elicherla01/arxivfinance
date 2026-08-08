"use client";

import * as React from "react";

import { formatDate, relativeTime } from "@/lib/utils";

/**
 * Relative labels depend on "now", which differs between the prerender and the
 * browser. Render the stable date first, then swap to the relative form.
 */
export function RelativeTime({ iso }: { iso: string }) {
  const [label, setLabel] = React.useState(() => formatDate(iso));

  React.useEffect(() => {
    const update = () => setLabel(relativeTime(iso));
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [iso]);

  return (
    <time dateTime={iso} title={formatDate(iso)}>
      {label}
    </time>
  );
}
