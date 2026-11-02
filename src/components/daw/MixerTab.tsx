"use client";

import { memo } from "react";
import type { Project, Track } from "@/lib/daw/types";
import { cn } from "@/lib/utils";
import { Meter } from "./ui";

function MixerTabInner({
  project,
  updateProject,
  getLevel,
  getMasterLevel,
}: {
  project: Project;
  updateProject: (fn: (p: Project) => Project) => void;
  getLevel: (trackId: string) => number;
  getMasterLevel: () => number;
}) {
  const setTrack = (id: string, patch: Partial<Track>) => {
    updateProject((p) => ({
      ...p,
      tracks: p.tracks.map((t) => (t.id === id ? ({ ...t, ...patch } as typeof t) : t)),
    }));
  };

  const anySolo = project.tracks.some((t) => t.solo);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {project.tracks.map((t) => {
          const audible = !t.muted && (!anySolo || t.solo);
          return (
            <div
              key={t.id}
              className="rounded-xl border border-white/5 bg-[#14100d] p-3"
            >
              <div className="flex items-center gap-2 pb-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: t.color, boxShadow: `0 0 8px ${t.color}66` }}
                />
                <span className="truncate text-[13px] font-semibold text-[#f0ece4]">
                  {t.name}
                </span>
                <span className="ml-auto font-mono text-[9px] uppercase text-[#a89f91]">
                  {t.kind === "drum" ? "DRUM" : "SYNTH"}
                </span>
              </div>
              <div className="flex gap-2">
                <div className="relative h-20 w-1.5 shrink-0 overflow-hidden rounded-full bg-black/50">
                  <Meter get={() => getLevel(t.id)} vertical className="h-full w-full bg-transparent ring-0" />
                </div>
                <div className="flex-1 space-y-2">
                  <div>
                    <div className="mb-0.5 flex justify-between font-mono text-[9px] uppercase text-[#a89f91]">
                      <span>Vol</span>
                      <span className="text-[#f0ece4]">{Math.round(t.volume * 100)}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1.3}
                      step={0.01}
                      value={t.volume}
                      onChange={(e) => setTrack(t.id, { volume: Number(e.target.value) })}
                      className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[#f2a43a]"
                    />
                  </div>
                  <div>
                    <div className="mb-0.5 flex justify-between font-mono text-[9px] uppercase text-[#a89f91]">
                      <span>Pan</span>
                      <span className="text-[#f0ece4]">
                        {t.pan === 0 ? "C" : t.pan < 0 ? `L${Math.round(-t.pan * 100)}` : `R${Math.round(t.pan * 100)}`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.02}
                      value={t.pan}
                      onChange={(e) => setTrack(t.id, { pan: Number(e.target.value) })}
                      className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[#f2a43a]"
                    />
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setTrack(t.id, { muted: !t.muted })}
                      className={cn(
                        "h-5 flex-1 rounded font-mono text-[9px] font-bold",
                        t.muted ? "bg-[#e5533d] text-white" : "bg-white/5 text-[#a89f91] hover:bg-white/10"
                      )}
                    >
                      M
                    </button>
                    <button
                      onClick={() => setTrack(t.id, { solo: !t.solo })}
                      className={cn(
                        "h-5 flex-1 rounded font-mono text-[9px] font-bold",
                        t.solo ? "bg-[#f2a43a] text-[#17120a]" : "bg-white/5 text-[#a89f91] hover:bg-white/10"
                      )}
                    >
                      S
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-2 space-y-1.5 border-t border-white/5 pt-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-8 font-mono text-[9px] uppercase text-[#a89f91]">Dly</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={t.delaySend}
                    onChange={(e) => setTrack(t.id, { delaySend: Number(e.target.value) })}
                    className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-[#8fbf6b]"
                  />
                  <span className="w-6 text-right font-mono text-[9px] text-[#a89f91]">
                    {Math.round(t.delaySend * 100)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-8 font-mono text-[9px] uppercase text-[#a89f91]">Rev</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={t.reverbSend}
                    onChange={(e) => setTrack(t.id, { reverbSend: Number(e.target.value) })}
                    className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-[#8fbf6b]"
                  />
                  <span className="w-6 text-right font-mono text-[9px] text-[#a89f91]">
                    {Math.round(t.reverbSend * 100)}
                  </span>
                </div>
              </div>
              {!audible && (
                <div className="mt-1 rounded bg-black/30 py-0.5 text-center font-mono text-[8px] uppercase tracking-widest text-[#e5533d]">
                  {t.muted ? "muted" : "not soloed"}
                </div>
              )}
            </div>
          );
        })}

        {/* MASTER */}
        <div className="rounded-xl border border-[#f2a43a]/30 bg-gradient-to-b from-[#1c150c] to-[#14100d] p-3">
          <div className="flex items-center gap-2 pb-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#f2a43a]" />
            <span className="text-[13px] font-semibold text-[#f0ece4]">MASTER</span>
            <span className="ml-auto font-mono text-[9px] uppercase text-[#f2a43a]">MAIN OUT</span>
          </div>
          <div className="flex gap-2">
            <div className="relative h-20 w-1.5 shrink-0 overflow-hidden rounded-full bg-black/50">
              <Meter get={getMasterLevel} vertical className="h-full w-full bg-transparent ring-0" />
            </div>
            <div className="flex-1">
              <div className="mb-0.5 flex justify-between font-mono text-[9px] uppercase text-[#a89f91]">
                <span>Vol</span>
                <span className="text-[#f0ece4]">{Math.round(project.masterVolume * 100)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1.3}
                step={0.01}
                value={project.masterVolume}
                onChange={(e) =>
                  updateProject((p) => ({ ...p, masterVolume: Number(e.target.value) }))
                }
                className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[#f2a43a]"
              />
              <div className="mt-2 rounded-md bg-black/40 px-2 py-1.5 text-center">
                <div className="font-mono text-[9px] uppercase tracking-wider text-[#a89f91]">
                  Limiter · glue
                </div>
                <div className="font-mono text-[10px] text-[#f2a43a]">ON · −6 dB</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="text-center font-mono text-[10px] tracking-wide text-[#a89f91]/70">
        SHARED BUSES: DOTTED-8TH DELAY + CONVOLUTION REVERB · SENDS PER CHANNEL
      </div>
    </div>
  );
}

/** memoised — the studio re-renders on every playback step */
export const MixerTab = memo(MixerTabInner);
