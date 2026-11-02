"use client";

import { useState } from "react";
import { Maximize2, Pause, Play } from "lucide-react";
import { EqBars } from "./kit";
import { cn } from "@/lib/utils";

/* ---------------- background waves ---------------- */
function HeroWaves() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <svg className="wave-drift absolute -left-24 top-24 w-[130%] opacity-[0.16]" viewBox="0 0 1200 300" fill="none">
        <path d="M0 150 C 200 80, 300 220, 500 150 S 800 60, 1000 150 S 1150 220, 1200 150" stroke="#f2a43a" strokeWidth="1" />
        <path d="M0 160 C 220 100, 320 230, 520 160 S 820 80, 1020 160 S 1160 230, 1200 160" stroke="#e5c15a" strokeWidth="0.7" />
        <path d="M0 140 C 180 60, 340 200, 540 140 S 840 40, 1040 140 S 1140 200, 1200 140" stroke="#8fbf6b" strokeWidth="0.5" opacity="0.6" />
      </svg>
      <svg className="wave-drift absolute -left-24 bottom-10 w-[130%] opacity-10" viewBox="0 0 1200 200" fill="none" style={{ animationDelay: "-3s" }}>
        <path d="M0 100 C 250 30, 350 170, 550 100 S 850 20, 1050 100 S 1150 170, 1200 100" stroke="#f0ece4" strokeWidth="0.8" />
      </svg>
      {[
        [8, 30], [16, 68], [30, 18], [44, 82], [58, 26], [70, 70], [84, 40], [93, 62],
      ].map(([x, y], i) => (
        <span
          key={i}
          className="pulse-dot absolute h-1 w-1 rounded-full bg-[#f0ece4]"
          style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 0.4}s` }}
        />
      ))}
    </div>
  );
}

/* ---------------- animated studio tour ---------------- */

const SLIDES = ["Beat Sequencer", "Piano roll", "Mixer", "Session"];

function SlideSequencer() {
  const rows: Array<[string, string, number[]]> = [
    ["KICK", "#f2a43a", [0, 4, 8, 12]],
    ["SNARE", "#e5c15a", [4, 12]],
    ["HAT", "#d97b5a", [2, 6, 8, 10, 14]],
    ["PERC", "#8fbf6b", [7, 11, 15]],
  ];
  return (
    <div className="space-y-2.5 p-5 sm:p-7">
      {rows.map(([name, color, steps]) => (
        <div key={name} className="flex items-center gap-3">
          <span className="w-14 font-mono text-[10px] tracking-wider text-[#a89f91]">{name}</span>
          <div className="grid flex-1 grid-cols-16 gap-1.5">
            {Array.from({ length: 16 }, (_, i) => (
              <span
                key={i}
                className={cn("h-6 rounded-[5px] sm:h-7", steps.includes(i) ? "step-on" : "bg-white/[0.05]")}
                style={steps.includes(i) ? { background: color, opacity: 0.9 } : undefined}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SlidePiano() {
  const notes: Array<[number, number, number, string]> = [
    // pitch-row, step, len, color
    [6, 0, 3, "#f2a43a"],
    [4, 3, 2, "#f2a43a"],
    [2, 5, 4, "#8fbf6b"],
    [7, 8, 3, "#e5c15a"],
    [5, 11, 2, "#8fbf6b"],
    [3, 13, 3, "#e5c15a"],
  ];
  return (
    <div className="space-y-[3px] p-5 sm:p-6">
      {[8, 7, 6, 5, 4, 3, 2, 1, 0].map((row) => (
        <div key={row} className="relative h-6 rounded-sm bg-white/[0.03]">
          <div className="absolute inset-0 grid grid-cols-16">
            {Array.from({ length: 16 }, (_, i) => (
              <span key={i} className={cn("border-r border-black/25", i % 4 === 0 ? "bg-white/[0.03]" : "")} />
            ))}
          </div>
          {notes
            .filter(([r]) => r === row)
            .map(([, step, len, color], i) => (
              <span
                key={i}
                className="absolute top-[2px] h-[calc(100%-4px)] rounded-[4px] ring-1 ring-black/40"
                style={{ left: `${step * 6.25}%`, width: `${len * 6.25 - 0.6}%`, background: color, opacity: 0.85 }}
              />
            ))}
        </div>
      ))}
    </div>
  );
}

function SlideMixer() {
  const chans: Array<[string, string, number, string]> = [
    ["Drums", "#f2a43a", 72, "EQ · GLUE"],
    ["Bass", "#e5c15a", 84, "DUCK"],
    ["Keys", "#d97b5a", 58, "CHORUS"],
    ["Lead", "#8fbf6b", 66, "DELAY"],
    ["Pad", "#b8a98f", 44, "REVERB"],
  ];
  return (
    <div className="flex items-end gap-3 p-5 sm:p-7">
      {chans.map(([name, color, lvl, fx]) => (
        <div key={name} className="flex flex-1 flex-col items-center gap-1.5">
          <span className="font-mono text-[8px] uppercase tracking-wide text-[#a89f91]">{fx}</span>
          <div className="flex h-24 w-full items-end overflow-hidden rounded-md bg-black/50 sm:h-28">
            <span
              className="w-full rounded-md"
              style={{ height: `${lvl}%`, background: `linear-gradient(to top, ${color}44, ${color})` }}
            />
          </div>
          <EqBars count={3} className="h-2.5" />
          <span className="text-[10px] font-semibold text-[#f0ece4]">{name}</span>
        </div>
      ))}
      <div className="flex flex-1 flex-col items-center gap-1.5">
        <span className="font-mono text-[8px] uppercase tracking-wide text-[#f2a43a]">MASTER</span>
        <div className="flex h-24 w-full items-end overflow-hidden rounded-md bg-black/50 ring-1 ring-[#f2a43a]/40 sm:h-28">
          <span className="w-full rounded-md bg-gradient-to-t from-[#c97f1e] to-[#ffe9c2]" style={{ height: "78%" }} />
        </div>
        <span className="font-mono text-[9px] text-[#f2a43a]">−14.4 LUFS</span>
        <span className="text-[10px] font-semibold text-[#f0ece4]">Out</span>
      </div>
    </div>
  );
}

function SlideSession() {
  const scenes: Array<[string, string, Array<[string, string]>]> = [
    ["INTRO", "key1", [["Drums", "#f2a43a"], ["Sub", "#e5c15a"]]],
    ["VERSE", "key2", [["Groove", "#f2a43a"], ["Keys", "#e5c15a"], ["Bass", "#8fbf6b"]]],
    ["BUILD", "key3", [["Rise", "#d97b5a"], ["Arp", "#e5c15a"], ["Snare", "#f2a43a"]]],
    ["DROP", "key4", [["Hook", "#f2a43a"], ["Acid", "#8fbf6b"], ["Crash", "#e5c15a"]]],
  ];
  return (
    <div className="grid grid-cols-4 gap-2.5 p-5 sm:p-7">
      {scenes.map(([name, key, clips]) => (
        <div key={name} className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] tracking-widest text-[#a89f91]">{name}</span>
            <span className="rounded bg-black/40 px-1 font-mono text-[8px] uppercase text-[#f2a43a]">{key}</span>
          </div>
          {clips.map(([label, color]) => (
            <div
              key={label}
              className="flex h-10 items-center justify-between rounded-md px-2 ring-1 ring-white/5 sm:h-12"
              style={{ background: `linear-gradient(to right, ${color}33, ${color}11)` }}
            >
              <span className="text-[10px] font-semibold text-[#f0ece4] sm:text-[11px]">{label}</span>
              <EqBars count={3} className="h-2.5" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function TourMock({ onFullScreen }: { onFullScreen: () => void }) {
  const [paused, setPaused] = useState(false);
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-[#100d0b] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#e5533d]" />
          <span className="h-2 w-2 rounded-full bg-[#e5c15a]" />
          <span className="h-2 w-2 rounded-full bg-[#8fbf6b]" />
          <span className="ml-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[#a89f91]">
            Intellidaw tour
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaused((p) => !p)}
            className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-[12px] text-[#f0ece4] hover:bg-white/10"
          >
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{paused ? "Play tour" : "Pause tour"}</span>
          </button>
          <button
            onClick={onFullScreen}
            className="flex items-center gap-1.5 rounded-lg bg-[#f2a43a] px-3 py-1.5 text-[12px] font-semibold text-[#17120a] hover:bg-[#ffb75c]"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Open the studio</span>
          </button>
        </div>
      </div>
      <div className="relative h-[300px] sm:h-[380px]">
        {SLIDES.map((label, i) => (
          <div
            key={label}
            className={cn("tour-slide tour-slide-" + i, "absolute inset-0 flex flex-col")}
            style={{ animationPlayState: paused ? "paused" : "running" }}
          >
            <div className="px-5 pt-4 sm:px-7">
              <span className="rounded-full bg-[#f2a43a]/12 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-[#f2a43a]">
                {label}
              </span>
            </div>
            <div className="min-h-0 flex-1" style={{ animationPlayState: paused ? "paused" : "running" }}>
              <div className="tour-slide-inner h-full" style={{ animationPlayState: paused ? "paused" : "running" }}>
                {i === 0 && <SlideSequencer />}
                {i === 1 && <SlidePiano />}
                {i === 2 && <SlideMixer />}
                {i === 3 && <SlideSession />}
              </div>
            </div>
          </div>
        ))}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[#100d0b] to-transparent" />
      </div>
    </div>
  );
}

/* ---------------- hero ---------------- */

export function Hero({
  onOpenStudio,
  onSeeInstruments,
}: {
  onOpenStudio: () => void;
  onSeeInstruments: () => void;
}) {
  return (
    <div className="relative overflow-hidden pt-28 sm:pt-32">
      <HeroWaves />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid items-end gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] py-1.5 pl-1.5 pr-4 text-[13px]">
              <span className="rounded-full bg-[#f2a43a] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-[#17120a]">
                New
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-[#f2a43a] pulse-dot" />
              <span className="text-[#a89f91]">
                <strong className="font-semibold text-[#f0ece4]">SX-1 Sampler</strong>: chop any
                loop and play it to tempo
              </span>
            </div>
            <h1 className="text-balance text-[52px] font-medium leading-[0.98] tracking-[-0.03em] text-[#f0ece4] sm:text-7xl lg:text-[86px]">
              Make the track in your head
            </h1>
          </div>
          <div className="lg:pb-3">
            <p className="max-w-lg text-[17px] leading-relaxed text-[#a89f91] sm:text-lg">
              Intellidaw is a free online DAW: a full music studio in your browser with six
              instruments, a 16-pad sampler, drums, a mixer and an assistant that reads your
              song. Nothing to install.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button
                onClick={onOpenStudio}
                className="rounded-xl bg-[#f2a43a] px-6 py-3.5 text-[15px] font-semibold text-[#17120a] shadow-[0_10px_40px_-10px_rgba(242,164,58,0.5)] transition-all hover:bg-[#ffb75c] hover:shadow-[0_14px_44px_-10px_rgba(242,164,58,0.6)]"
              >
                Start creating free
              </button>
              <button
                onClick={onSeeInstruments}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-6 py-3.5 text-[15px] font-semibold text-[#f0ece4] transition-colors hover:bg-white/[0.07]"
              >
                See the instruments
              </button>
            </div>
            <div className="mt-4 font-mono text-[11px] tracking-wide text-[#a89f91]/80">
              Free forever · works offline · projects stay on your device · no login
            </div>
          </div>
        </div>

        <div className="mt-8 inline-flex max-w-xl items-start gap-3 rounded-2xl border border-[#f2a43a]/20 bg-[#f2a43a]/[0.05] p-4">
          <span className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#f2a43a]/15 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wide text-[#f2a43a]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#f2a43a]" />
            Public beta
          </span>
          <p className="text-[13.5px] leading-relaxed text-[#c9c0b2]">
            Intellidaw is still being built. Things may change or break — your feedback shapes
            what comes next.
          </p>
        </div>

        <div className="mt-10 pb-4">
          <TourMock onFullScreen={onOpenStudio} />
        </div>
      </div>
    </div>
  );
}
