"use client";

/* ------------------------------------------------------------------ */
/*  Pads — THE PAD DECK                                                */
/*                                                                     */
/*  4×4 rubber-pad grid in the console language: category-coloured     */
/*  glow bars + corner LEDs (kick / snare / hats / perc / fx),         */
/*  MPC-style pad bodies with inset shadows and press-down feel,       */
/*  keyboard key chips, per-pad sample loading (user badge + remove)   */
/*  and a hit flash that lights the pad in its category colour.        */
/* ------------------------------------------------------------------ */

import { memo, useRef, useState } from "react";
import { defaultPads, type DrumSound, type KitPad, type Project } from "@/lib/daw/types";
import { cn } from "@/lib/utils";
import { Screw } from "./console";

/** sound → deck category (colour + label) */
const PAD_CATS: Array<{ test: (s: DrumSound) => boolean; color: string; label: string }> = [
  { test: (s) => s === "kick" || s === "kick2", color: "#e5533d", label: "kick" },
  { test: (s) => s === "snare" || s === "clap", color: "#f2a43a", label: "snare" },
  { test: (s) => s === "chat" || s === "ohat" || s === "ride" || s === "shaker", color: "#e5c15a", label: "hats" },
  { test: (s) => s === "perc" || s === "tom" || s === "conga" || s === "rim", color: "#8fbf6b", label: "perc" },
  { test: () => true, color: "#b58ee0", label: "fx" },
];
const padCat = (s: DrumSound) => PAD_CATS.find((c) => c.test(s))!;

function PadsTabInner({
  project,
  updateProject,
  onPlayPad,
  flashSlot,
}: {
  project: Project;
  updateProject: (fn: (p: Project) => Project) => void;
  onPlayPad: (slot: number) => void;
  flashSlot: number | null;
}) {
  const fileRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [error, setError] = useState<string | null>(null);

  const setPad = (slot: number, patch: Partial<KitPad>) => {
    updateProject((p) => ({
      ...p,
      pads: p.pads.map((pad) => (pad.slot === slot ? { ...pad, ...patch } : pad)),
    }));
  };

  const loadSample = async (slot: number, file: File) => {
    setError(null);
    if (file.size > 900_000) {
      setError("Sample too large — keep it under 900 KB so it stays on your device.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPad(slot, { custom: { name: file.name, dataUrl: String(reader.result) } });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3">
      {/* THE PAD DECK */}
      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0f0b08] shadow-[0_10px_40px_rgba(0,0,0,0.45)]">
        {/* top rail */}
        <div className="flex flex-wrap items-center gap-2.5 border-b border-black/60 bg-gradient-to-b from-[#241c11] to-[#171209] px-3 py-1.5">
          <Screw />
          <span className="font-mono text-[9px] font-bold tracking-[0.3em] text-[#f2a43a]">INTELLIDAW</span>
          <span className="font-mono text-[7.5px] tracking-[0.2em] text-[#6f675c]">
            PAD DECK · 16 PADS · KEYS 1–0 · Q W E R T Y
          </span>
          <button
            onClick={() => updateProject((p) => ({ ...p, pads: defaultPads() }))}
            className="ml-auto rounded-md bg-white/5 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#a89f91] hover:bg-white/10 hover:text-[#f0ece4]"
          >
            reset kit
          </button>
          <Screw />
        </div>

        <div className="p-2.5 sm:p-3">
          {error && (
            <div className="mb-2.5 rounded-lg border border-[#e5533d]/30 bg-[#e5533d]/10 px-3 py-2 text-xs text-[#ff9a8a]">
              {error}
            </div>
          )}

          <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
            {project.pads.map((pad) => {
              const cat = padCat(pad.sound);
              const hit = flashSlot === pad.slot;
              return (
                <div key={pad.slot} className="relative">
                  <button
                    onPointerDown={() => onPlayPad(pad.slot)}
                    className={cn(
                      "relative flex h-20 w-full select-none flex-col items-start justify-between overflow-hidden rounded-lg border border-white/8 bg-gradient-to-b from-[#221a12] to-[#120e0a] p-2.5 text-left transition-all hover:border-[#f2a43a]/40 active:scale-[0.97] sm:h-24 sm:p-3",
                      hit && "pad-flash"
                    )}
                    style={
                      hit
                        ? { borderColor: cat.color, boxShadow: `0 0 22px ${cat.color}55, inset 0 0 14px ${cat.color}30` }
                        : {
                            boxShadow:
                              "inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -2px 6px rgba(0,0,0,0.5), 0 2px 5px rgba(0,0,0,0.35)",
                          }
                    }
                  >
                    {/* category glow bar */}
                    <span
                      aria-hidden
                      className="absolute inset-x-4 top-[3px] h-[2px] rounded-full"
                      style={{ background: cat.color, opacity: hit ? 1 : 0.5 }}
                    />
                    <div className="flex w-full items-center justify-between">
                      <span
                        className="rounded bg-black/45 px-1.5 py-0.5 font-mono text-[9px] font-bold"
                        style={{ color: cat.color }}
                      >
                        {pad.key.toUpperCase()}
                      </span>
                      {pad.custom && (
                        <span className="rounded bg-[#8fbf6b]/20 px-1 font-mono text-[8px] uppercase text-[#8fbf6b]">
                          user
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold text-[#f0ece4] sm:text-sm">
                        {pad.custom ? pad.custom.name.replace(/\.[^.]+$/, "").slice(0, 14) : pad.label}
                      </div>
                      <div className="font-mono text-[9px] uppercase tracking-wide text-[#a89f91]">
                        {pad.custom ? "sample" : cat.label}
                      </div>
                    </div>
                    {/* corner LED */}
                    <span
                      aria-hidden
                      className="absolute bottom-2 right-2 h-1.5 w-1.5 rounded-full"
                      style={{
                        background: cat.color,
                        opacity: hit ? 1 : 0.22,
                        boxShadow: hit ? `0 0 8px ${cat.color}` : "none",
                      }}
                    />
                  </button>
                  <div className="absolute -top-1.5 right-1.5 flex gap-1">
                    <button
                      onClick={() => fileRefs.current[pad.slot]?.click()}
                      className="rounded bg-[#14100d] px-1.5 py-0.5 font-mono text-[9px] text-[#a89f91] ring-1 ring-white/10 hover:text-[#f0ece4]"
                      title="Load your own sample (WAV / MP3)"
                    >
                      ↓
                    </button>
                    {pad.custom && (
                      <button
                        onClick={() => setPad(pad.slot, { custom: null })}
                        className="rounded bg-[#14100d] px-1.5 py-0.5 font-mono text-[9px] text-[#e5533d] ring-1 ring-white/10"
                        title="Remove sample"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <input
                    ref={(el) => {
                      fileRefs.current[pad.slot] = el;
                    }}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void loadSample(pad.slot, f);
                      e.target.value = "";
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* category legend */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/5 px-0.5 pt-2 font-mono text-[8px] uppercase tracking-[0.15em] text-[#6f675c]">
            {PAD_CATS.map((c) => (
              <span key={c.label} className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.color }} />
                {c.label}
              </span>
            ))}
            <span className="ml-auto normal-case tracking-wide">↓ load your own sample on any pad</span>
          </div>
        </div>
      </div>

      <div className="text-center font-mono text-[10px] tracking-wide text-[#a89f91]/70">
        PRESS A PAD OR USE THE KEYBOARD · SHIFT+CLICK FOR VELOCITY IN THE BEAT EDITOR
      </div>
    </div>
  );
}

/** memoised — the studio re-renders on every playback step */
export const PadsTab = memo(PadsTabInner);
