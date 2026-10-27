"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

/**
 * A <Link> that prefetches on intent (hover, touch, keyboard focus) instead
 * of the moment it scrolls into view.
 *
 * The app's pages are all dynamic (they read the session), and a viewport
 * prefetch of a dynamic route is still one server round trip per link — the
 * proxy, a function invocation, and, once a route has a loading.js, a render
 * of every layout above it (auth + database queries). The console menu
 * shows up to ~20 links on every page, so viewport prefetching cost ~20
 * requests per page view for pages the user mostly never opens. Prefetching
 * on intent keeps the head start for the link actually being reached for.
 *
 * Pattern from the Next 16 prefetching guide ("Hover-triggered prefetch"):
 * `prefetch={null}` restores the default once the user shows intent.
 */
export function IntentLink({
  onMouseEnter,
  onTouchStart,
  onFocus,
  ...props
}: Omit<ComponentProps<typeof Link>, "prefetch">) {
  const [active, setActive] = useState(false);

  return (
    <Link
      {...props}
      prefetch={active ? null : false}
      onMouseEnter={(e) => {
        setActive(true);
        onMouseEnter?.(e);
      }}
      onTouchStart={(e) => {
        setActive(true);
        onTouchStart?.(e);
      }}
      onFocus={(e) => {
        setActive(true);
        onFocus?.(e);
      }}
    />
  );
}
