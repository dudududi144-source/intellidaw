"use client";

/* ------------------------------------------------------------------ */
/*  Visualizer — full-screen audio visualizer (bars / wave / ring)     */
/* ------------------------------------------------------------------ */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Mode = "bars" | "wave" | "ring";
const MODES: Mode[] = ["bars", "wave", "ring"];
const MODE_LABEL: Record<Mode, string> = {
  bars: "SPECTRUM BARS",
  wave: "OSCILLOSCOPE",
  ring: "RADIAL RING",
};

export function Visualizer({
  open,
  onClose,
  getMasterLevel,
  getAnalyser,
}: {
  open: boolean;
  onClose: () => void;
  getMasterLevel?: () => number;
  getAnalyser?: () => AnalyserNode | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const [mode, setMode] = useState<Mode>("bars");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === " ") {
        e.preventDefault();
        setMode((m) => MODES[(MODES.indexOf(m) + 1) % MODES.length]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const freq = new Uint8Array(256);
    const time = new Uint8Array(1024);
    let phase = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const mid = mode;
      ctx2d.clearRect(0, 0, w, h);
      // backdrop glow
      const bg = ctx2d.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, Math.max(w, h) * 0.7);
      bg.addColorStop(0, "rgba(242,164,58,0.07)");
      bg.addColorStop(1, "rgba(0,0,0,0)");
      ctx2d.fillStyle = bg;
      ctx2d.fillRect(0, 0, w, h);

      const an = getAnalyser?.() ?? null;
      const lvl = Math.min(1, Math.max(0, getMasterLevel?.() ?? 0));
      phase += 0.02 + lvl * 0.06;

      if (an) {
        an.getByteFrequencyData(freq);
        an.getByteTimeDomainData(time);
      }

      if (mid === "bars") {
        const bars = 64;
        const bw = w / bars;
        for (let i = 0; i < bars; i++) {
          const src = Math.floor(Math.pow(i / bars, 1.6) * 200);
          let v = an ? freq[src] / 255 : lvl * (0.35 + 0.3 * Math.sin(phase * 3 + i * 0.5));
          v = Math.max(0.015, v);
          const bh = v * h * 0.62;
          const g = ctx2d.createLinearGradient(0, h, 0, h - bh);
          g.addColorStop(0, "#c97f1e");
          g.addColorStop(0.6, "#f2a43a");
          g.addColorStop(1, "#ffe9c2");
          ctx2d.fillStyle = g;
          ctx2d.fillRect(i * bw + 1, h - bh, bw - 2, bh);
          ctx2d.globalAlpha = 0.28;
          ctx2d.fillRect(i * bw + 1, h - bh - 5, bw - 2, 3);
          ctx2d.globalAlpha = 1;
        }
      } else if (mid === "wave") {
        ctx2d.lineWidth = 2.4;
        ctx2d.strokeStyle = "#f2a43a";
        ctx2d.shadowColor = "rgba(242,164,58,0.7)";
        ctx2d.shadowBlur = 14;
        ctx2d.beginPath();
        const n = an ? time.length : 512;
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * w;
          const v = an ? (time[i] - 128) / 128 : Math.sin(i * 0.05 + phase * 4) * lvl;
          const y = h / 2 + v * h * 0.34;
          if (i === 0) ctx2d.moveTo(x, y);
          else ctx2d.lineTo(x, y);
        }
        ctx2d.stroke();
        ctx2d.shadowBlur = 0;
      } else {
        // radial ring
        const cx = w / 2;
        const cy = h / 2;
        const base = Math.min(w, h) * 0.18;
        ctx2d.lineWidth = 3;
        const pts = 96;
        for (let i = 0; i < pts; i++) {
          const a = (i / pts) * Math.PI * 2;
          const src = Math.floor(Math.pow(i / pts, 1.4) * 200);
          const v = an ? freq[src] / 255 : lvl * (0.3 + 0.3 * Math.sin(phase * 3 + i * 0.6));
          const r = base + v * Math.min(w, h) * 0.22;
          const x1 = cx + Math.cos(a) * base;
          const y1 = cy + Math.sin(a) * base;
          const x2 = cx + Math.cos(a) * r;
          const y2 = cy + Math.sin(a) * r;
          const g = ctx2d.createLinearGradient(x1, y1, x2, y2);
          g.addColorStop(0, "rgba(242,164,58,0.9)");
          g.addColorStop(1, "#ffe9c2");
          ctx2d.strokeStyle = g;
          ctx2d.beginPath();
          ctx2d.moveTo(x1, y1);
          ctx2d.lineTo(x2, y2);
          ctx2d.stroke();
        }
        ctx2d.beginPath();
        ctx2d.arc(cx, cy, base * (0.9 + lvl * 0.12), 0, Math.PI * 2);
        ctx2d.strokeStyle = "rgba(255,233,194,0.5)";
        ctx2d.stroke();
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [open, mode, getAnalyser, getMasterLevel]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/95"
      role="dialog"
      aria-label="Audio visualizer"
      onClick={() => setMode((m) => MODES[(MODES.indexOf(m) + 1) % MODES.length])}
    >
      <canvas ref={canvasRef} className="block h-full w-full" aria-hidden />
      <button
        onClick={onClose}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-lg text-white hover:bg-white/20"
        aria-label="Close visualizer"
      >
        ✕
      </button>
      <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-center font-mono text-[11px] uppercase tracking-[0.25em] text-[#f2a43a]">
        {MODE_LABEL[mode]}
        <span className="mt-1 block text-[9px] tracking-widest text-white/40">
          click / space to change · esc to close
        </span>
      </div>
    </div>
  );
}
