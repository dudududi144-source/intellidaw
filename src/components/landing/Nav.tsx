"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Clock3,
  Disc3,
  Grid3x3,
  Menu,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { WaveIcon } from "@/components/daw/Studio";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#features", label: "Features", icon: Sparkles },
  { href: "#instruments", label: "Instruments", icon: Activity },
  { href: "#kits", label: "Sampler Kits", icon: Grid3x3 },
  { href: "#assistant", label: "Assistant", icon: Clock3 },
  { href: "#mixing", label: "Mixing", icon: SlidersHorizontal },
  { href: "#perform", label: "Perform", icon: Disc3 },
];

export function Nav({ onOpenStudio }: { onOpenStudio: () => void }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 transition-all duration-300",
        scrolled ? "border-b border-white/[0.06] bg-[#0a0807]/85 backdrop-blur-md" : "bg-transparent"
      )}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6" aria-label="Main">
        <button
          onClick={onOpenStudio}
          className="flex items-center gap-2.5"
          aria-label="Intellidaw home — open the studio"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1d1815] ring-1 ring-white/10">
            <WaveIcon className="h-5 w-5 text-[#f2a43a]" />
          </span>
          <span className="hidden text-[17px] font-bold tracking-tight text-[#f0ece4] sm:block">Intellidaw</span>
          <span className="hidden rounded-full border border-[#f2a43a]/40 px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-[#f2a43a] sm:inline">
            Beta
          </span>
        </button>

        <div className="mx-auto hidden items-center gap-1 lg:flex">
          {LINKS.map(({ href, label, icon: Icon }) => (
            <a
              key={href}
              href={href}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13.5px] text-[#a89f91] transition-colors hover:bg-white/5 hover:text-[#f0ece4]"
            >
              <Icon className="h-3.5 w-3.5 text-[#f2a43a]/80" aria-hidden />
              {label}
            </a>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <button
            onClick={onOpenStudio}
            className="whitespace-nowrap rounded-xl bg-[#f2a43a] px-3.5 py-2 text-[13.5px] font-semibold text-[#17120a] transition-colors hover:bg-[#ffb75c] sm:px-4"
          >
            Open studio
          </button>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#f0ece4] hover:bg-white/5 lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-white/[0.06] bg-[#0a0807]/95 px-4 py-3 backdrop-blur-md lg:hidden">
          <div className="grid grid-cols-2 gap-1">
            {LINKS.map(({ href, label, icon: Icon }) => (
              <a
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-[#a89f91] hover:bg-white/5 hover:text-[#f0ece4]"
              >
                <Icon className="h-4 w-4 text-[#f2a43a]/80" aria-hidden />
                {label}
              </a>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
