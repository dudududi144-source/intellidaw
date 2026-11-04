"use client";

/* ------------------------------------------------------------------ */
/*  Console primitives — rotary knobs + long-throw faders              */
/*                                                                     */
/*  Pointer-drag controls built for a mixing console:                  */
/*   · drag vertically, hold Shift for fine resolution                 */
/*   · double-click snaps back to the reset value                      */
/*   · keyboard: ↑/↓/←/→ (±2 steps, Shift = ±1), Home/End,             */
/*     Enter = reset — full ARIA slider semantics                      */
/*   · Knob draws a 270° SVG arc (bipolar arcs grow from 12 o'clock)   */
/*   · VFader renders a recessed slot, a dB tick scale and a gripped   */
/*     fader cap whose centre marks the value                          */
/*  All live motion is pointer-driven — no React state per frame.      */
/* ------------------------------------------------------------------ */

import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/* angle helpers — 0° is 12 o'clock, sweep runs -135°..+135° */
function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
function arcPath(cx: number, cy: number, r: number, a1: number, a2: number) {
  const s = polar(cx, cy, r, a1);
  const e = polar(cx, cy, r, a2);
  const large = Math.abs(a2 - a1) > 180 ? 1 : 0;
  const sweep = a2 >= a1 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} ${sweep} ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

/** snap a value to the control step and clamp it into range */
const quantize = (v: number, min: number, max: number, step: number) =>
  Number(Math.min(max, Math.max(min, Math.round(v / step) * step)).toFixed(4));

/* ------------------------------------------------------------------ */
/*  Knob                                                               */
/* ------------------------------------------------------------------ */

export function Knob({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  resetTo,
  bipolar = false,
  size = 30,
  accent = "#f2a43a",
  label,
  format,
  title,
  className,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  /** value applied on double-click / Enter (undefined = no reset) */
  resetTo?: number;
  /** when true the value arc grows from 12 o'clock (pan / EQ) */
  bipolar?: boolean;
  size?: number;
  accent?: string;
  label?: string;
  format?: (v: number) => string;
  title?: string;
  className?: string;
}) {
  const norm = clamp01((value - min) / (max - min));
  const angle = -135 + norm * 270;
  const zeroAngle = bipolar ? 0 : -135;

  const drag = useRef<{ y: number; v: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { y: e.clientY, v: value };
      e.preventDefault();
    },
    [value]
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const d = drag.current;
      if (!d) return;
      const fine = e.shiftKey ? 0.25 : 1;
      const dv = ((d.y - e.clientY) / 150) * (max - min) * fine;
      onChange(quantize(d.v + dv, min, max, step));
    },
    [onChange, min, max, step]
  );
  const endDrag = useCallback(() => {
    drag.current = null;
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let next: number | null = null;
      if (e.key === "ArrowUp" || e.key === "ArrowRight") next = value + step * (e.shiftKey ? 1 : 2);
      else if (e.key === "ArrowDown" || e.key === "ArrowLeft") next = value - step * (e.shiftKey ? 1 : 2);
      else if (e.key === "Home") next = min;
      else if (e.key === "End") next = max;
      else if ((e.key === "Enter" || e.key === "Escape") && resetTo !== undefined) next = resetTo;
      if (next !== null) {
        e.preventDefault();
        onChange(quantize(next, min, max, step));
      }
    },
    [value, step, min, max, resetTo, onChange]
  );

  const S = 44; // svg viewBox
  const C = S / 2;
  const R = 15.5;
  const ind = polar(C, C, R - 6, angle);

  return (
    <div className={cn("flex select-none flex-col items-center gap-0.5", className)} title={title}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${S} ${S}`}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Number(value.toFixed(2))}
        aria-valuetext={format ? format(value) : String(Number(value.toFixed(2)))}
        className="cursor-ns-resize touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#f2a43a]/70"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => resetTo !== undefined && onChange(resetTo)}
        onKeyDown={onKeyDown}
      >
        {/* body */}
        <circle cx={C} cy={C} r={R} fill="#0d0a07" stroke="rgba(255,255,255,0.09)" />
        <circle cx={C} cy={C} r={R - 4} fill="rgba(255,255,255,0.03)" />
        {/* track arc */}
        <path
          d={arcPath(C, C, R + 2.5, -135, 135)}
          fill="none"
          stroke="rgba(255,255,255,0.10)"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        {/* value arc */}
        <path
          d={arcPath(C, C, R + 2.5, zeroAngle, angle)}
          fill="none"
          stroke={accent}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        {/* pointer */}
        <line x1={C} y1={C} x2={ind.x} y2={ind.y} stroke={accent} strokeWidth={2} strokeLinecap="round" opacity={0.9} />
        <circle cx={C} cy={C} r={3.5} fill="rgba(255,255,255,0.10)" />
      </svg>
      {label && <span className="font-mono text-[7px] uppercase tracking-wider text-[#6f675c]">{label}</span>}
      {format && <span className="font-mono text-[7.5px] text-[#a89f91]">{format(value)}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  VFader — long-throw vertical fader                                 */
/* ------------------------------------------------------------------ */

const CAP_H = 24;

export function VFader({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  resetTo,
  height = 200,
  accent = "#f2a43a",
  ticks,
  label,
  format,
  className,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  resetTo?: number;
  height?: number;
  accent?: string;
  /** tick marks drawn at proportional positions — [value, label] */
  ticks?: Array<[number, string]>;
  label?: string;
  format?: (v: number) => string;
  className?: string;
}) {
  const norm = clamp01((value - min) / (max - min));
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; v: number } | null>(null);

  const usable = height - CAP_H;

  /** pointer position → fader value (cap centre follows the pointer) */
  const posToValue = useCallback(
    (clientY: number) => {
      const el = trackRef.current;
      if (!el) return value;
      const r = el.getBoundingClientRect();
      const fromBottom = r.bottom - clientY;
      const p = clamp01((fromBottom - CAP_H / 2) / usable);
      return min + p * (max - min);
    },
    [usable, min, max, value]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      const v = posToValue(e.clientY);
      drag.current = { y: e.clientY, v };
      onChange(quantize(v, min, max, step));
      e.preventDefault();
    },
    [posToValue, onChange, min, max, step]
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d) return;
      const fine = e.shiftKey ? 0.25 : 1;
      const dv = ((d.y - e.clientY) / usable) * (max - min) * fine;
      onChange(quantize(d.v + dv, min, max, step));
    },
    [usable, min, max, step, onChange]
  );
  const endDrag = useCallback(() => {
    drag.current = null;
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let next: number | null = null;
      if (e.key === "ArrowUp") next = value + step * (e.shiftKey ? 1 : 2);
      else if (e.key === "ArrowDown") next = value - step * (e.shiftKey ? 1 : 2);
      else if (e.key === "Home") next = min;
      else if (e.key === "End") next = max;
      else if ((e.key === "Enter" || e.key === "Escape") && resetTo !== undefined) next = resetTo;
      if (next !== null) {
        e.preventDefault();
        onChange(quantize(next, min, max, step));
      }
    },
    [value, step, min, max, resetTo, onChange]
  );

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Number(value.toFixed(2))}
      aria-valuetext={format ? format(value) : String(Number(value.toFixed(2)))}
      className={cn(
        "relative cursor-pointer touch-none select-none rounded outline-none focus-visible:ring-2 focus-visible:ring-[#f2a43a]/70",
        className
      )}
      style={{ height }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => resetTo !== undefined && onChange(resetTo)}
      onKeyDown={onKeyDown}
    >
      {/* recessed slot */}
      <div className="absolute inset-y-0 left-1/2 w-[4px] -translate-x-1/2 rounded-full bg-black/80 ring-1 ring-inset ring-white/5" />
      {/* dB tick scale */}
      {ticks?.map(([v, text]) => {
        const p = clamp01((v - min) / (max - min));
        return (
          <span
            key={text}
            className="pointer-events-none absolute right-full mr-0.5 -translate-y-1/2 whitespace-nowrap font-mono text-[6.5px] text-[#6f675c]"
            style={{ bottom: (p * usable + CAP_H / 2).toFixed(1) + "px" }}
          >
            {text}
          </span>
        );
      })}
      {/* fader cap */}
      <div
        className="pointer-events-none absolute left-1/2 w-full -translate-x-1/2"
        style={{ bottom: (norm * usable).toFixed(1) + "px", height: CAP_H }}
      >
        <div className="relative h-full w-full rounded-[4px] border border-white/15 bg-gradient-to-b from-[#3d3327] via-[#282019] to-[#171310] shadow-[0_2px_5px_rgba(0,0,0,0.55)]">
          <span className="absolute left-1 right-1 top-[3px] h-px bg-black/60" />
          <span className="absolute left-1 right-1 top-[6px] h-px bg-black/60" />
          <span className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2" style={{ background: accent }} />
          <span className="absolute bottom-[6px] left-1 right-1 h-px bg-black/60" />
          <span className="absolute bottom-[3px] left-1 right-1 h-px bg-black/60" />
        </div>
      </div>
    </div>
  );
}
