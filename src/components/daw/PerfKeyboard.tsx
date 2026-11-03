"use client";

/* ------------------------------------------------------------------ */
/*  PerfKeyboard — play the selected synth track from your keyboard    */
/*  or the on-screen piano (like intellidaw's performance keyboard).   */
/* ------------------------------------------------------------------ */

import { useEffect, useRef, useState } from "react";
import type { SynthTrack } from "@/lib/daw/types";
import { isBlackKey } from "@/lib/daw/types";
import { cn } from "@/lib/utils";

const KEY_ROW = ["a", "w", "s", "e", "d", "f", "t", "g", "y", "h", "u", "j", "k", "o", "l", "p"];

export function PerfKeyboard({
  open,
  onClose,
  track,
  onPlay,
  octave,
  onOctave,
}: {
  open: boolean;
  onClose: () => void;
  track: SynthTrack | null;
  onPlay: (pitch: number) => void;
  octave: number;
  onOctave: (o: number) => void;
}) {
  const [pressed, setPressed] = useState<Set<number>>(new Set());
  const pressedRef = useRef<Set<string>>(new Set());

  const base = 48 + octave * 12; // C3 at octave 0
  const count = 24; // two octaves

  const press = (pitch: number) => {
    onPlay(pitch);
    setPressed((s) => new Set(s).add(pitch));
    setTimeout(() => setPressed((s) => {
      const n = new Set(s);
      n.delete(pitch);
      return n;
    }), 190);
  };

  /* computer-keyboard mapping */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === "escape") {
        onClose();
        return;
      }
      if (k === "z") {
        onOctave(Math.max(-2, octave - 1));
        return;
      }
      if (k === "x") {
        onOctave(Math.min(3, octave + 1));
        return;
      }
      const idx = KEY_ROW.indexOf(k);
      if (idx >= 0) {
        const id = `${k}:${octave}`;
        if (pressedRef.current.has(id)) return;
        pressedRef.current.add(id);
        setTimeout(() => pressedRef.current.delete(id), 150);
        press(base + idx);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, octave, base, onPlay, onOctave, onClose]);

  if (!open) return null;

  const keys = Array.from({ length: count }, (_, i) => base + i);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end" role="dialog" aria-label="Performance keyboard">
      <button className="flex-1 bg-black/60" onClick={onClose} tabIndex={-1} aria-label="Close keyboard" />
      <div className="rounded-t-2xl border-t border-white/10 bg-[#100d0b] p-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:mx-auto sm:mb-6 sm:w-fit sm:rounded-2xl sm:border">
        <div className="mb-2 flex items-center gap-2 px-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#f2a43a]">
            play · {track?.name ?? "select a synth track"}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => onOctave(Math.max(-2, octave - 1))}
              className="h-7 w-7 rounded bg-white/8 font-mono text-[11px] text-[#a89f91] hover:bg-white/15"
              aria-label="Octave down"
            >
              −
            </button>
            <span className="w-10 text-center font-mono text-[10px] text-[#a89f91]">oct {octave >= 0 ? `+${octave}` : octave}</span>
            <button
              onClick={() => onOctave(Math.min(3, octave + 1))}
              className="h-7 w-7 rounded bg-white/8 font-mono text-[11px] text-[#a89f91] hover:bg-white/15"
              aria-label="Octave up"
            >
              +
            </button>
            <button
              onClick={onClose}
              className="ml-1 h-7 w-7 rounded bg-white/8 text-[11px] text-[#a89f91] hover:bg-white/15"
              aria-label="Close keyboard"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="flex h-28 select-none items-stretch gap-px sm:h-32" role="list" aria-label="Piano keys">
          {keys.map((pitch, i) => {
            const black = isBlackKey(pitch);
            const keyChar = i < KEY_ROW.length ? KEY_ROW[i].toUpperCase() : "";
            return (
              <button
                key={pitch}
                role="listitem"
                onPointerDown={() => press(pitch)}
                className={cn(
                  "relative flex flex-col items-center justify-end pb-1.5 rounded-b-md font-mono text-[8px] transition-colors",
                  black
                    ? "z-10 -mx-3 w-6 bg-[#2a2119] text-white/50 ring-1 ring-inset ring-white/10 hover:bg-[#3a2d20]"
                    : "w-8 bg-[#efe7d8] text-[#5c5344] hover:bg-white sm:w-10",
                  pressed.has(pitch) && (black ? "bg-[#f2a43a] text-black" : "bg-[#f2a43a] text-black")
                )}
                aria-label={`Play ${pitch}`}
              >
                {keyChar && <span className="opacity-70">{keyChar}</span>}
              </button>
            );
          })}
        </div>
        <div className="mt-1.5 px-1 text-center font-mono text-[8px] uppercase tracking-widest text-[#a89f91]/60">
          play with the A-row · z / x shift octave
        </div>
      </div>
    </div>
  );
}
