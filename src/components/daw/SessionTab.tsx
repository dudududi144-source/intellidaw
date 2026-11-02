"use client";

import { memo, useCallback, useRef } from "react";
import type { Project } from "@/lib/daw/types";
import { trackIcon } from "@/lib/daw/types";
import { getEngine } from "@/lib/daw/engine";
import { cn } from "@/lib/utils";
import { PanelTitle } from "./ui";
import { Button } from "@/components/ui/button";

function SessionTabInner({
  project,
  currentStep,
  playing,
}: {
  project: Project;
  currentStep: number; // absolute, -1 stopped
  playing: boolean;
}) {
  const curBar = currentStep >= 0 ? Math.floor(currentStep / 16) : -1;
  const filterRef = useRef<HTMLInputElement>(null);
  const driveRef = useRef<HTMLInputElement>(null);

  const launchScene = useCallback((bar: number) => {
    const e = getEngine();
    if (!e.playing) return;
    e.jumpTo(bar * 16);
  }, []);

  const stopAll = useCallback(() => {
    getEngine().stop();
  }, []);

  const resetFx = useCallback(() => {
    getEngine().setLiveFilter(1);
    getEngine().setLiveDrive(0);
    if (filterRef.current) filterRef.current.value = "1";
    if (driveRef.current) driveRef.current.value = "0";
  }, []);

  const masterVol = Math.round(project.masterVolume * 100);

  return (
    <div className="space-y-4">
      <PanelTitle kicker="Session · live">Launch scenes, ride the master FX</PanelTitle>

      {/* scene launchers */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {project.sections.map((s, i) => {
          const active = playing && curBar === i;
          return (
            <button
              key={s.id}
              onClick={() => launchScene(s.startBar)}
              disabled={!playing}
              className={cn(
                "group relative overflow-hidden rounded-xl border p-3 text-left transition-all",
                active
                  ? "border-[#8fbf6b]/70 bg-[#141b0d]"
                  : "border-white/8 bg-[#14100d] hover:border-[#f2a43a]/40",
                !playing && "opacity-50"
              )}
            >
              <div className="flex items-center gap-2">
                {active ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#8fbf6b] text-[10px] text-[#10130a]">▶</span>
                ) : (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white/15 text-[10px] text-[#a89f91] group-hover:border-[#f2a43a] group-hover:text-[#f2a43a]">▶</span>
                )}
                <span className="text-[13px] font-semibold text-[#f0ece4]">{s.name}</span>
                <span className="ml-auto font-mono text-[8px] uppercase tracking-wider text-[#a89f91]">
                  {s.startBar + 1}
                </span>
              </div>
              {/* track dots — lit when the track plays in this scene */}
              <div className="mt-2 flex flex-wrap gap-1">
                {project.tracks.map((t) => {
                  const on = !s.mutes.includes(t.id);
                  return (
                    <span
                      key={t.id}
                      title={t.name}
                      className={cn("flex h-4 w-4 items-center justify-center rounded text-[8px]", on ? "" : "opacity-25")}
                      style={{ background: on ? `${t.color}2e` : "rgba(255,255,255,0.05)", color: t.color }}
                    >
                      {trackIcon(t)}
                    </span>
                  );
                })}
              </div>
              {active && (
                <div className="mt-2 font-mono text-[8px] uppercase tracking-widest text-[#8fbf6b]">
                  ● playing
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={stopAll} disabled={!playing} className="border-white/10 bg-transparent text-[12px] text-[#a89f91] hover:bg-white/5 hover:text-[#f0ece4]">
          ■ Stop all
        </Button>
        <span className="font-mono text-[9px] uppercase tracking-wider text-[#a89f91]/70">
          start playing in the transport first · scenes jump on tap
        </span>
      </div>

      {/* LIVE FX strip */}
      <div className="rounded-xl border border-white/8 bg-[#14100d] p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#f2a43a]">Live FX</span>
          <span className="font-mono text-[9px] text-[#a89f91]">shapes the whole mix</span>
          <button
            onClick={resetFx}
            className="ml-auto rounded-md bg-white/5 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-[#a89f91] hover:bg-white/10"
          >
            reset
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-1 flex justify-between font-mono text-[9px] uppercase text-[#a89f91]">
              <span>Filter sweep</span>
              <span className="text-[#f0ece4]">LP</span>
            </div>
            <input
              ref={filterRef}
              type="range"
              min={0}
              max={1}
              step={0.01}
              defaultValue={1}
              onChange={(e) => getEngine().setLiveFilter(Number(e.target.value))}
              className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[#f2a43a]"
              aria-label="Master low-pass filter"
            />
          </div>
          <div>
            <div className="mb-1 flex justify-between font-mono text-[9px] uppercase text-[#a89f91]">
              <span>Drive</span>
              <span className="text-[#f0ece4]">warm</span>
            </div>
            <input
              ref={driveRef}
              type="range"
              min={0}
              max={1}
              step={0.01}
              defaultValue={0}
              onChange={(e) => getEngine().setLiveDrive(Number(e.target.value))}
              className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[#e5533d]"
              aria-label="Master drive"
            />
          </div>
        </div>
      </div>

      <div className="text-center font-mono text-[10px] tracking-wide text-[#a89f91]/70">
        MASTER {masterVol}% · FX APPLY ON TOP OF THE MIXDOWN · PRESS PLAY THEN JAM
      </div>

      {/* live jam cheat-sheet */}
      <div className="grid gap-2.5 sm:grid-cols-3">
        <div className="rounded-xl border border-white/8 bg-[#14100d] p-3">
          <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-[#f2a43a]">
            Transport
          </div>
          <ul className="space-y-1.5 font-mono text-[10px] text-[#a89f91]">
            <li className="flex justify-between"><span>play / stop</span><kbd className="rounded bg-white/8 px-1.5 py-0.5 text-[#f0ece4]">Space</kbd></li>
            <li className="flex justify-between"><span>back to start</span><kbd className="rounded bg-white/8 px-1.5 py-0.5 text-[#f0ece4]">⏮ btn</kbd></li>
            <li className="flex justify-between"><span>metronome</span><kbd className="rounded bg-white/8 px-1.5 py-0.5 text-[#f0ece4]">M</kbd></li>
            <li className="flex justify-between"><span>undo / redo</span><span className="text-[#f0ece4]">Ctrl+Z / Shift</span></li>
          </ul>
        </div>
        <div className="rounded-xl border border-white/8 bg-[#14100d] p-3">
          <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-[#f2a43a]">
            Jam keys
          </div>
          <ul className="space-y-1.5 font-mono text-[10px] text-[#a89f91]">
            <li className="flex justify-between"><span>drum pads</span><span className="text-[#f0ece4]">1–0 · Q W E R T Y</span></li>
            <li className="flex justify-between"><span>piano keys</span><span className="text-[#f0ece4]">A S D F G H J K L</span></li>
            <li className="flex justify-between"><span>pad velocity</span><span className="text-[#f0ece4]">Shift+click</span></li>
            <li className="flex justify-between"><span>devices</span><span className="text-[#f0ece4]">SKAZI tab</span></li>
          </ul>
        </div>
        <div className="rounded-xl border border-white/8 bg-[#14100d] p-3">
          <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-[#f2a43a]">
            Arrangement
          </div>
          <div className="space-y-1">
            {project.sections.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="font-mono text-[10px] text-[#f0ece4]">{s.name}</span>
                <span className="ml-auto font-mono text-[9px] text-[#a89f91]">
                  bar {i + 1} · {project.tracks.length - s.mutes.length}/{project.tracks.length} in
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 border-t border-white/5 pt-2 font-mono text-[9px] uppercase tracking-wider text-[#a89f91]">
            {project.bpm} BPM · {project.songKey} · swing {Math.round(project.swing * 100)}%
          </div>
        </div>
      </div>
    </div>
  );
}

export const SessionTab = memo(SessionTabInner);
