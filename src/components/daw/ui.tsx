"use client";

import { useEffect, useRef } from "react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

/* Animated level meter driven by a getter (no re-renders) */
export function Meter({
  get,
  vertical = false,
  className,
}: {
  get: () => number;
  vertical?: boolean;
  className?: string;
}) {
  const fill = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    let smoothed = 0;
    const loop = () => {
      const v = Math.min(1, get());
      smoothed = v > smoothed ? v : smoothed * 0.88 + v * 0.12;
      if (fill.current) {
        if (vertical) fill.current.style.height = `${Math.round(smoothed * 100)}%`;
        else fill.current.style.width = `${Math.round(smoothed * 100)}%`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [get, vertical]);
  return (
    <div
      className={cn(
        "overflow-hidden rounded-full bg-black/50 ring-1 ring-inset ring-white/5",
        vertical ? "w-1.5 h-full" : "h-1.5 w-full",
        className
      )}
      aria-hidden
    >
      <div
        ref={fill}
        className={cn(
          "rounded-full bg-gradient-to-t from-[#c97f1e] via-[#f2a43a] to-[#ffe9c2]",
          vertical ? "w-full absolute bottom-0" : "h-full"
        )}
        style={vertical ? { height: "0%" } : { width: "0%" }}
      />
    </div>
  );
}

export function ParamRow({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-wider text-[#a89f91]">
        {label}
      </span>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
        className="flex-1 [&_[data-slot=slider-thumb]]:size-3"
      />
      <span className="w-10 shrink-0 text-right font-mono text-[10px] text-[#f0ece4]">
        {format ? format(value) : value.toFixed(2)}
      </span>
    </div>
  );
}

export function TabButton({
  active,
  children,
  onClick,
  icon,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? "bg-[#f2a43a] text-[#17120a]"
          : "text-[#a89f91] hover:bg-white/5 hover:text-[#f0ece4]"
      )}
      aria-pressed={active}
    >
      {icon}
      {children}
    </button>
  );
}

export function PanelTitle({
  kicker,
  children,
}: {
  kicker?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      {kicker && (
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#f2a43a]">
          {kicker}
        </div>
      )}
      <h3 className="text-[15px] font-semibold text-[#f0ece4]">{children}</h3>
    </div>
  );
}
