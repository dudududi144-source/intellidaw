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

/* ------------------------------------------------------------------ */
/*  ProMeter — console-style level meter                               */
/*                                                                     */
/*  RMS gradient fill (smoothed) + instant peak cap + peak-hold line   */
/*  (1.5 s hold) + dBFS tick scale (0/−6/−12/−24/−48) + a latching     */
/*  clip LED (click to clear). Driven by a getter in a rAF loop —      */
/*  zero React re-renders while the transport runs.                    */
/* ------------------------------------------------------------------ */

const DB_TICKS: Array<[number, string]> = [
  [1, "0"],
  [0.501, "6"],
  [0.251, "12"],
  [0.126, "24"],
  [0.04, "48"],
];

export function ProMeter({
  getInfo,
  orientation = "vertical",
  showTicks = true,
  showHold = true,
  className,
}: {
  /** returns linear RMS + peak in 0..1 (see engine levelInfo/masterLevels) */
  getInfo: () => { rms: number; peak: number };
  orientation?: "vertical" | "horizontal";
  showTicks?: boolean;
  showHold?: boolean;
  className?: string;
}) {
  const rmsRef = useRef<HTMLDivElement>(null);
  const capRef = useRef<HTMLDivElement>(null);
  const holdRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLElement>(null);
  const latch = useRef(false);
  const st = useRef({ s: 0, holdV: 0, holdAt: 0 });

  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const { rms, peak } = getInfo();
      const s = st.current;
      s.s = rms > s.s ? rms : rms * 0.82 + s.s * 0.18;
      const r = Math.min(1, s.s);
      const p = Math.min(1, peak);
      const pos = (v: number) => `${Math.round(v * 1000) / 10}%`;
      const vertical = orientation === "vertical";
      if (rmsRef.current) {
        if (vertical) rmsRef.current.style.height = pos(r);
        else rmsRef.current.style.width = pos(r);
      }
      if (capRef.current) {
        if (vertical) capRef.current.style.bottom = `calc(${pos(p)} - 1px)`;
        else capRef.current.style.left = `calc(${pos(p)} - 1px)`;
      }
      if (showHold && holdRef.current && (p >= s.holdV || now >= s.holdAt)) {
        s.holdV = p;
        s.holdAt = now + 1500;
        if (vertical) holdRef.current.style.bottom = pos(p);
        else holdRef.current.style.left = pos(p);
      }
      if (clipRef.current) {
        clipRef.current.style.opacity = latch.current ? "1" : String(Math.min(1, p * 4));
      }
      if (p >= 0.985) latch.current = true;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [getInfo, orientation, showHold]);

  const vertical = orientation === "vertical";
  return (
    <div
      className={cn("flex gap-1", vertical ? "flex-col items-stretch" : "flex-row items-stretch", className)}
    >
      <button
        type="button"
        onClick={() => {
          latch.current = false;
        }}
        title="Clip — click to clear"
        aria-label="Clip indicator (click to clear)"
        className={cn(
          "shrink-0 overflow-hidden rounded-[2px] bg-black/60 ring-1 ring-inset ring-white/10",
          vertical ? "h-1.5 w-full" : "h-full w-1.5"
        )}
      >
        <span ref={clipRef} className="block h-full w-full bg-[#ff3b2f] opacity-0" />
      </button>
      <div
        className={cn(
          "relative flex-1 overflow-hidden rounded-[3px] bg-black/60 ring-1 ring-inset ring-white/10",
          vertical ? "w-3" : "h-3"
        )}
        aria-hidden
      >
        {showTicks &&
          DB_TICKS.map(([v]) =>
            vertical ? (
              <div
                key={v}
                className="absolute inset-x-0 h-px bg-white/12"
                style={{ bottom: `${v * 100}%` }}
              />
            ) : (
              <div
                key={v}
                className="absolute inset-y-0 w-px bg-white/12"
                style={{ left: `${v * 100}%` }}
              />
            )
          )}
        {/* RMS fill (smoothed) */}
        <div
          ref={rmsRef}
          className={cn(
            "absolute bg-gradient-to-t from-[#4f8f3f] via-[#c9a13a] to-[#ff6b4a]",
            vertical ? "inset-x-0 bottom-0" : "inset-y-0 left-0 bg-gradient-to-r"
          )}
          style={vertical ? { height: "0%" } : { width: "0%" }}
        />
        {/* instant peak cap */}
        <div
          ref={capRef}
          className={cn(
            "absolute bg-[#ffe9c2]",
            vertical ? "inset-x-0 h-0.5" : "inset-y-0 w-0.5"
          )}
          style={vertical ? { bottom: "0%" } : { left: "0%" }}
        />
        {/* peak hold */}
        {showHold && (
          <div
            ref={holdRef}
            className={cn("absolute bg-white/75", vertical ? "inset-x-0 h-px" : "inset-y-0 w-px")}
            style={vertical ? { bottom: "0%" } : { left: "0%" }}
          />
        )}
      </div>
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
