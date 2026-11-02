"use client";

import { useRef, useState } from "react";
import { defaultPads, type KitPad, type Project } from "@/lib/daw/types";
import { cn } from "@/lib/utils";
import { PanelTitle } from "./ui";

export function PadsTab({
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PanelTitle kicker="Kit · your library">16 pads · any sound</PanelTitle>
        <div className="flex gap-2">
          <button
            onClick={() => updateProject((p) => ({ ...p, pads: defaultPads() }))}
            className="rounded-md bg-white/5 px-2.5 py-1 font-mono text-[10px] uppercase text-[#a89f91] hover:bg-white/10 hover:text-[#f0ece4]"
          >
            Reset kit
          </button>
        </div>
      </div>
      {error && (
        <div className="rounded-lg border border-[#e5533d]/30 bg-[#e5533d]/10 px-3 py-2 text-xs text-[#ff9a8a]">
          {error}
        </div>
      )}
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {project.pads.map((pad) => (
          <div key={pad.slot} className="relative">
            <button
              onPointerDown={() => onPlayPad(pad.slot)}
              className={cn(
                "flex h-20 w-full flex-col items-start justify-between rounded-xl border border-white/8 bg-gradient-to-b from-[#1c1712] to-[#120e0b] p-2.5 text-left transition-all hover:border-[#f2a43a]/40 sm:h-24 sm:p-3",
                flashSlot === pad.slot && "pad-flash border-[#f2a43a] shadow-[0_0_24px_rgba(242,164,58,0.25)]"
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#f2a43a]">
                  {pad.key.toUpperCase()}
                </span>
                {pad.custom && (
                  <span className="rounded bg-[#8fbf6b]/20 px-1 font-mono text-[8px] uppercase text-[#8fbf6b]">
                    user
                  </span>
                )}
              </div>
              <div>
                <div className="text-[13px] font-semibold text-[#f0ece4] sm:text-sm">
                  {pad.custom ? pad.custom.name.replace(/\.[^.]+$/, "").slice(0, 14) : pad.label}
                </div>
                <div className="font-mono text-[9px] uppercase tracking-wide text-[#a89f91]">
                  {pad.custom ? "sample" : "synth"}
                </div>
              </div>
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
        ))}
      </div>
      <div className="text-center font-mono text-[10px] tracking-wide text-[#a89f91]/70">
        PLAY WITH KEYS 1-0 · Q W E R T Y · LOAD YOUR OWN SAMPLES WITH ↓
      </div>
    </div>
  );
}
