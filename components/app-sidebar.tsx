"use client";

import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand-mark";
import { SidebarNav } from "@/components/sidebar-nav";
import type { UserRole } from "@/lib/auth";

const KEY = "mca-sidebar-collapsed";

export function AppSidebar({
  role,
  email,
  roleLabel,
  badges,
  enabled,
  version,
  brandLogo,
  brandName,
}: {
  brandLogo?: string | null;
  brandName?: string | null;
  role: UserRole | null;
  email: string | null;
  roleLabel: string;
  badges: Record<string, number>;
  enabled?: Record<string, boolean>;
  version: string;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (localStorage.getItem(KEY) === "1") setCollapsed(true);
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(KEY, next ? "1" : "0");
  }

  return (
    <aside data-print="hide"
      className={cn(
        "hidden shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 p-3",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        {!collapsed && (
          <div className="inline-flex rounded-lg bg-white px-3 py-2 shadow-sm">
            <BrandMark logoUrl={brandLogo} orgName={brandName} width={124} />
          </div>
        )}
        <button
          onClick={toggle}
          title={collapsed ? "Expand" : "Collapse"}
          className="rounded-lg p-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
        >
          {collapsed ? (
            <PanelLeft className="size-5" />
          ) : (
            <PanelLeftClose className="size-5" />
          )}
        </button>
      </div>

      <div className="flex-1 px-3">
        <SidebarNav role={role} badges={badges} enabled={enabled} collapsed={collapsed} />
      </div>

      {!collapsed && (
        <div className="border-t border-sidebar-border p-3">
          <p className="text-xs text-sidebar-foreground/60">{roleLabel}</p>
          <p className="truncate text-sm">{email}</p>
          <p className="mt-3 text-center text-[11px] text-sidebar-foreground/40">
            {version}
          </p>
        </div>
      )}
    </aside>
  );
}
