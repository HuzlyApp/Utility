"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { XIcon } from "@/components/ui/icons";

export interface MobileNavItem {
  href: string;
  label: string;
}

function isItemActive(href: string, pathname: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Shared collapsible drawer for primary navigation on small screens.
 *
 * Renders a hamburger button (visible only below the `sm` breakpoint) and a
 * full-height slide-in panel with a focus trap and Escape-to-close. Desktop
 * navigation is left untouched — consumers keep their existing `hidden sm:*`
 * nav strip alongside this component.
 */
export function MobileNav({
  items,
  ariaLabel = "Primary navigation",
  footer,
  breakpoint = "md",
}: {
  items: MobileNavItem[];
  ariaLabel?: string;
  footer?: React.ReactNode;
  /**
   * Viewport breakpoint below which the hamburger + drawer are shown.
   * Must match the `hidden {breakpoint}:flex` rule on the matching desktop
   * nav so there is never a gap nor an overlap. Defaults to "md".
   */
  breakpoint?: "sm" | "md" | "lg";
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelId = useId();
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const firstLinkRef = useRef<HTMLAnchorElement | null>(null);

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Static class map so Tailwind's JIT sees the literal class strings. Dynamic
  // templates like `${breakpoint}:hidden` would otherwise be purged.
  const hiddenAt =
    breakpoint === "sm"
      ? "sm:hidden"
      : breakpoint === "lg"
        ? "lg:hidden"
        : "md:hidden";
  const overlayHiddenAt =
    breakpoint === "sm"
      ? "sm:hidden"
      : breakpoint === "lg"
        ? "lg:hidden"
        : "md:hidden";

  // Lock background scroll + trap focus while open.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => firstLinkRef.current?.focus(), 0);

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        closeBtnRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        ref={closeBtnRef}
        aria-label="Open navigation menu"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
          hiddenAt
        )}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {open && (
        <div
          className={cn("fixed inset-0 z-[90]", overlayHiddenAt)}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
        >
          <div
            className="confirm-modal-overlay absolute inset-0 bg-slate-900/50"
            onClick={() => setOpen(false)}
          />
          <div
            id={panelId}
            className="absolute left-0 top-0 flex h-full w-[min(20rem,85vw)] flex-col bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <span className="text-sm font-semibold text-slate-900">Menu</span>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <nav className="dialog-scroll flex-1 overflow-y-auto py-2">
              <ul>
                {items.map((item, i) => {
                  const active = isItemActive(item.href, pathname);
                  return (
                    <li key={item.href}>
                      <Link
                        ref={i === 0 ? firstLinkRef : undefined}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "block border-l-2 px-4 py-3 text-[15px] font-medium transition-colors",
                          active
                            ? "border-brand-600 bg-brand-50 text-brand-800"
                            : "border-transparent text-slate-700 hover:bg-slate-50"
                        )}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            {footer && (
              <div className="border-t border-slate-200 px-4 py-3">{footer}</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
