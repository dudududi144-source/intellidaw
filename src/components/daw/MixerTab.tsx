"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import type { BusName, Project, Track } from "@/lib/daw/types";
import { cn } from "@/lib/utils";
import { Meter } from "./ui";

const BUS_OPTS: Array<{ id: BusName; label: string }> = [
  { id: "drums", label: "D" },
  { id: "bass", label: "B" },
  { id: "music", label: "M" },
];

const BUS_STRIPS: Array<{ id: BusName; label: string }> = [
  { id: "drums", label: "Drums" },
  { id: "bass", label: "Bass" },
  { id: "music", label: "Music" },
];

const fmtLufs = (n: number) => n.toFixed(1);
const fmtCpu = (n: number) => `${Math.round(n)}%`;

/** DOM-level readout polled at ~4 Hz via rAF — keeps the memoised mixer from re-rendering */
function LiveReadout({
  get,
  format,
  fallback,
}: {
  get?: () => number;
  format: (n: number) => string;
  fallback: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!get) return;
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 250) return; // ~4 refreshes per second
      last = now;
      if (ref.current) ref.current.textContent = format(get());
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [get, format]);
  return <span ref={ref}>{fallback}</span>;
}

function MixerTabInner({
  project,
  updateProject,
  getLevel,
  getMasterLevel,
  getMasterLufs,
  getCpu,
}: {
  project: Project;
  updateProject: (fn: (p: Project) => Project) => void;
  getLevel: (trackId: string) => number;
  getMasterLevel: () => number;
  /** live integrated loudness (approx LUFS) — renders "—" when absent */
  getMasterLufs?: () => number;
  /** rough engine load 0..100 — renders "—" when absent */
  getCpu?: () => number;
}) {
  const setTrack = (id: string, patch: Partial<Track>) => {
    updateProject((p) => ({
      ...p,
      tracks: p.tracks.map((t) => (t.id === id ? ({ ...t, ...patch } as typeof t) : t)),
    }));
  };

  const anySolo = project.tracks.some((t) => t.solo);

  // bus group meters — visual only (the engine routes buses internally)
  const busMembers = useMemo(() => {
    const byBus: Record<BusName, string[]> = { drums: [], bass: [], music: [] };
    for (const t of project.tracks) byBus[t.bus].push(t.id);
    return byBus;
  }, [project.tracks]);

  const busGetters = useMemo(
    () => ({
      drums: () => busMembers.drums.reduce((a, id) => a + getLevel(id), 0),
      bass: () => busMembers.bass.reduce((a, id) => a + getLevel(id), 0),
      music: () => busMembers.music.reduce((a, id) => a + getLevel(id), 0),
    }),
    [busMembers, getLevel]
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {project.tracks.map((t) => {
          const audible = !t.muted && (!anySolo || t.solo);
          return (
            <div
              key={t.id}
              className={cn(
                "rounded-xl border p-3",
                audible ? "border-white/5 bg-[#14100d]" : "border-white/5 bg-[#14100d]/60"
              )}
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
              {/* group bus routing */}
              <div className="mb-2 flex items-center gap-1.5">
                <span className="font-mono text-[9px] uppercase text-[#a89f91]">Bus</span>
                <div className="ml-auto flex overflow-hidden rounded-md ring-1 ring-inset ring-white/10" role="group" aria-label="Group bus">
                  {BUS_OPTS.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setTrack(t.id, { bus: b.id })}
                      title={`Route to ${b.id} bus`}
                      aria-pressed={t.bus === b.id}
                      className={cn(
                        "h-5 w-7 font-mono text-[9px] font-bold transition-colors",
                        t.bus === b.id
                          ? "bg-[#f2a43a] text-[#17120a]"
                          : "bg-white/5 text-[#a89f91] hover:bg-white/10"
                      )}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
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

              {/* 3-band EQ */}
              <div className="mt-2 space-y-1 border-t border-white/5 pt-2">
                <div className="flex justify-between font-mono text-[8px] uppercase tracking-wider text-[#a89f91]">
                  <span>EQ</span>
                  <span>
                    {t.eqLow !== 0 || t.eqMid !== 0 || t.eqHigh !== 0 ? "shaping" : "flat"}
                  </span>
                </div>
                {(
                  [
                    ["eqLow", "L", "accent-[#e5c15a]"],
                    ["eqMid", "M", "accent-[#d97b5a]"],
                    ["eqHigh", "H", "accent-[#8fbf6b]"],
                  ] as const
                ).map(([key, label, accent]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <span className="w-3 font-mono text-[9px] text-[#a89f91]">{label}</span>
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      step={0.5}
                      value={t[key]}
                      onChange={(e) => setTrack(t.id, { [key]: Number(e.target.value) } as Partial<Track>)}
                      className={cn("h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/10", accent)}
                      aria-label={`${label} EQ ${Math.round(t[key])} dB`}
                    />
                    <span
                      className={cn(
                        "w-8 text-right font-mono text-[9px]",
                        t[key] === 0 ? "text-[#a89f91]" : "text-[#f0ece4]"
                      )}
                    >
                      {t[key] > 0 ? "+" : ""}
                      {t[key].toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-1.5 space-y-1.5 border-t border-white/5 pt-2">
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

              {/* kick sidechain */}
              <div
                className="mt-1.5 border-t border-white/5 pt-2"
                title="Ducks this channel every time the kick hits"
              >
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="font-mono text-[9px] uppercase text-[#a89f91]">Sidechain</span>
                  <span className="font-mono text-[9px] text-[#f0ece4]">{Math.round(t.duck * 100)}%</span>
                  <button
                    onClick={() => setTrack(t.id, { duck: t.duck > 0 ? 0 : 0.6 })}
                    title="Ducks this channel every time the kick hits"
                    aria-pressed={t.duck > 0}
                    className={cn(
                      "ml-auto h-4 rounded px-1.5 font-mono text-[8px] font-bold uppercase tracking-wider transition-colors",
                      t.duck > 0
                        ? "bg-[#f2a43a] text-[#17120a]"
                        : "bg-white/5 text-[#a89f91] hover:bg-white/10"
                    )}
                  >
                    {t.duck > 0 ? "on" : "off"}
                  </button>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={t.duck}
                  onChange={(e) => setTrack(t.id, { duck: Number(e.target.value) })}
                  className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[#e5533d]"
                  aria-label={`Sidechain duck depth ${Math.round(t.duck * 100)}%`}
                />
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
                <div className="font-mono text-[10px] text-[#f2a43a]">ON · −4 dB</div>
              </div>
              <div className="mt-1 rounded-md bg-black/40 px-2 py-1.5 text-center">
                <div className="font-mono text-[9px] uppercase tracking-wider text-[#a89f91]">
                  Song key
                </div>
                <div className="font-mono text-[10px] text-[#f0ece4]">{project.songKey}</div>
              </div>
            </div>
          </div>
          {/* live master metering — LUFS + CPU (wired by the studio when available) */}
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <div
              className="rounded-md bg-black/40 px-2 py-1.5 text-center"
              title="Integrated loudness (approx LUFS) of the live master"
            >
              <div className="font-mono text-[9px] uppercase tracking-wider text-[#a89f91]">LUFS</div>
              <div className="font-mono text-[11px] text-[#f2a43a]">
                <LiveReadout get={getMasterLufs} format={fmtLufs} fallback="—" />
              </div>
            </div>
            <div
              className="rounded-md bg-black/40 px-2 py-1.5 text-center"
              title="Estimated engine load"
            >
              <div className="font-mono text-[9px] uppercase tracking-wider text-[#a89f91]">CPU</div>
              <div className="font-mono text-[11px] text-[#8fbf6b]">
                <LiveReadout get={getCpu} format={fmtCpu} fallback="—" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BUSES — visual group meters (the engine routes buses internally) */}
      <div className="rounded-xl border border-white/8 bg-[#14100d] p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#f2a43a]">Buses</span>
          <span className="font-mono text-[9px] text-[#a89f91]">
            group meters · routed internally by the engine
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {BUS_STRIPS.map((b) => (
            <div key={b.id} className="rounded-lg bg-black/30 px-2.5 py-2 ring-1 ring-inset ring-white/5">
              <div className="mb-1.5 flex items-baseline justify-between font-mono text-[9px] uppercase tracking-wider text-[#a89f91]">
                <span>{b.label}</span>
                <span className="text-[#f0ece4]">{busMembers[b.id].length} ch</span>
              </div>
              <Meter get={busGetters[b.id]} className="h-2" />
            </div>
          ))}
        </div>
      </div>
      <div className="text-center font-mono text-[10px] tracking-wide text-[#a89f91]/70">
        3-BAND EQ PER CHANNEL (LOW 90HZ · MID 1K · HIGH 7.5K) · BUSES: DOTTED-8TH DELAY + REVERB · SENDS PER CHANNEL
      </div>
    </div>
  );
}

/** memoised — the studio re-renders on every playback step */
export const MixerTab = memo(MixerTabInner);
