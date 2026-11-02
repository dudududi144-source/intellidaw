"use client";

import { useState } from "react";
import { CheckCircle2, Play, Scissors, SlidersHorizontal, Library, Waves } from "lucide-react";
import { previewDrumLanding, previewInstrument } from "@/lib/daw/preview";
import type { DrumSound } from "@/lib/daw/types";
import { cn } from "@/lib/utils";
import { Bullet, Card, Section, SectionHead } from "./kit";

/* ---------------- instruments ---------------- */

interface InstrumentDef {
  id: string;
  name: string;
  tag: string;
  desc: string;
  bullets: string[];
  wave: number[];
}

const INSTRUMENTS: InstrumentDef[] = [
  {
    id: "SX-1",
    name: "SX-1 Sampler",
    tag: "Sampler",
    desc: "Chop any loop equally or by transients, map it across 16 pads and play it to tempo with grooves, throws and choke groups.",
    bullets: ["Slice to pads", "Groove lanes per step", "Tune, start/end, reverse"],
    wave: [40, 75, 55, 90, 45, 80, 60, 95, 50, 85, 55, 70],
  },
  {
    id: "SA-2",
    name: "SA-2",
    tag: "Stock synth",
    desc: "Two oscillators with wavetables, sync and FM, a sub and noise layer, 24 dB filter, unison up to 7 voices and an onboard FX rack.",
    bullets: ["Bass, lead, pad, keys and pluck presets", "Glide, drift and filter key tracking", "Every knob automatable"],
    wave: [30, 55, 80, 95, 80, 55, 30, 45, 70, 90, 65, 40],
  },
  {
    id: "AX-3",
    name: "AX-3 Acid",
    tag: "Bassline",
    desc: "The classic squelch: a resonant filter with accent and slide, tuned for rolling 303-style basslines that sit under the kick.",
    bullets: ["Accent & slide", "Filter drive and snap", "Built-in distortion"],
    wave: [70, 30, 85, 35, 90, 40, 75, 30, 88, 38, 80, 34],
  },
  {
    id: "WX-4",
    name: "WX-4 Wavetable",
    tag: "Wavetable · New",
    desc: "Scan through morphing wavetables for evolving pads and aggressive leads. Load your own single-cycle or Serum-style tables.",
    bullets: ["Position & morph controls", "Unison supersaw mode", "Your own wavetables"],
    wave: [50, 65, 85, 95, 75, 55, 45, 60, 80, 92, 70, 52],
  },
  {
    id: "MX-1",
    name: "MX-1 Mono",
    tag: "Guitar & lead · New",
    desc: "Models a plucked or bowed string, then runs it through wah, talk box, amp, cabinet and a feedback howl — clean to fuzz to slide.",
    bullets: ["Clean, crunch, fuzz and slide", "Amp & cabinet chain", "Supersaw and sync leads"],
    wave: [90, 70, 55, 65, 80, 60, 45, 58, 72, 55, 40, 50],
  },
  {
    id: "Creator",
    name: "Synth Creator",
    tag: "Modular",
    desc: "Patch oscillators, filters, LFOs and effects into your own instrument, then save it as a preset the whole studio can use.",
    bullets: ["Drag-and-drop modules", "Save your own presets", "Everything automatable"],
    wave: [35, 60, 45, 70, 50, 85, 55, 40, 65, 48, 75, 58],
  },
];

function WaveSvg({ points, color = "#f2a43a" }: { points: number[]; color?: string }) {
  const w = 320;
  const h = 80;
  const step = w / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${i * step} ${h - (p / 100) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full" aria-hidden>
      <path d={`${d} L ${w} ${h} L 0 ${h} Z`} fill={color} opacity="0.12" />
      <path d={d} stroke={color} strokeWidth="2" fill="none" strokeLinejoin="round" />
    </svg>
  );
}

export function Instruments() {
  const [sel, setSel] = useState<InstrumentDef>(INSTRUMENTS[1]);

  return (
    <Section id="instruments">
      <SectionHead
        kicker="Built-in instruments"
        title="Synths and a sampler that sound finished"
        sub="Six instruments ship inside the studio, each with presets made for real songs."
      />
      <div className="mt-10 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          {INSTRUMENTS.map((ins) => (
            <button
              key={ins.id}
              onClick={() => {
                setSel(ins);
                void previewInstrument(ins.id);
              }}
              className={cn(
                "flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors",
                sel.id === ins.id
                  ? "border-[#f2a43a]/40 bg-[#f2a43a]/[0.07]"
                  : "border-white/[0.06] bg-[#14100d] hover:border-white/15"
              )}
            >
              <div>
                <div className="text-[14.5px] font-semibold text-[#f0ece4]">{ins.name}</div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-[#a89f91]">{ins.tag}</div>
              </div>
              <Play className={cn("h-4 w-4", sel.id === ins.id ? "text-[#f2a43a]" : "text-white/20")} aria-hidden />
            </button>
          ))}
        </div>
        <Card className="flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xl font-semibold text-[#f0ece4]">{sel.name}</div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-[#f2a43a]">{sel.tag}</div>
              </div>
              <button
                onClick={() => void previewInstrument(sel.id)}
                className="flex items-center gap-2 rounded-lg bg-[#f2a43a] px-4 py-2 text-[13px] font-semibold text-[#17120a] hover:bg-[#ffb75c]"
              >
                <Play className="h-4 w-4" /> Hear it
              </button>
            </div>
            <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.06] bg-black/30 px-4 py-2">
              <WaveSvg points={sel.wave} />
            </div>
            <p className="mt-4 text-[14px] leading-relaxed text-[#c9c0b2]">{sel.desc}</p>
            <ul className="mt-4 space-y-1.5">
              {sel.bullets.map((b) => (
                <li key={b} className="flex items-center gap-2 text-[13px] text-[#a89f91]">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[#8fbf6b]" aria-hidden />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>
    </Section>
  );
}

/* ---------------- sampler kits (real pads!) ---------------- */

const KIT_PADS: Array<[DrumSound, string]> = [
  ["kick", "Kick"], ["kick2", "Kick 2"], ["snare", "Snare"], ["clap", "Clap"],
  ["chat", "C Hat"], ["ohat", "O Hat"], ["perc", "Perc"], ["rim", "Rim"],
  ["tom", "Tom"], ["conga", "Conga"], ["shaker", "Shaker"], ["ride", "Ride"],
  ["chop", "Chop 1"], ["chop", "Chop 2"], ["vox", "Vox"], ["fx", "FX"],
];

export function SamplerKits() {
  const [last, setLast] = useState<number | null>(null);
  return (
    <Section id="kits">
      <SectionHead
        kicker="Sampler kits"
        title="16 pads, any sound, your kit"
        sub="Start from a factory kit or drop in your own samples, then play, chop and sequence them like a hardware groovebox. Tap the pads — they really play."
      />
      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        <Card className="bg-gradient-to-b from-[#161210] to-[#100d0b]">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[13px] text-[#a89f91]">
              <span className="font-semibold text-[#f0ece4]">Kit</span> · Night Market
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-[#e5533d]/15 px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-[#e5533d]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#e5533d] pulse-dot" /> Rec
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
            {KIT_PADS.map(([sound, label], i) => (
              <button
                key={i}
                onPointerDown={() => {
                  void previewDrumLanding(sound);
                  setLast(i);
                  setTimeout(() => setLast((v) => (v === i ? null : v)), 240);
                }}
                className={cn(
                  "flex h-16 flex-col justify-between rounded-xl border border-white/[0.07] bg-gradient-to-b from-[#1c1712] to-[#120e0b] p-2.5 text-left transition-all hover:border-[#f2a43a]/50 sm:h-20",
                  last === i && "pad-flash border-[#f2a43a]"
                )}
                aria-label={`Play ${label}`}
              >
                <span className="font-mono text-[9px] font-bold text-[#f2a43a]/70">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[12px] font-semibold text-[#f0ece4] sm:text-[13px]">{label}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 text-center font-mono text-[10px] tracking-wide text-[#a89f91]/70">
            TAP THE PADS — REAL SOUND, RIGHT IN THE PAGE
          </div>
        </Card>
        <div className="grid content-start gap-3 sm:grid-cols-2">
          <Bullet icon={Scissors} title="Chop to pads" text="Slice a loop equally or by transients across consecutive pads." />
          <Bullet icon={Waves} title="Groove lanes" text="Velocity, chance, ratchets, nudge and send throws per step." />
          <Bullet icon={SlidersHorizontal} title="Shape every pad" text="Tune, start/end, envelope, reverse, choke groups and filter." />
          <Bullet icon={Library} title="Your library" text="Save kits, favourite samples and drag them onto any pad." />
        </div>
      </div>
    </Section>
  );
}
