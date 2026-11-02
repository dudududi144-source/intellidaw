"use client";

import {
  AudioWaveform,
  Compass,
  Disc3,
  GraduationCap,
  LayoutGrid,
  SlidersHorizontal,
} from "lucide-react";
import { Card, Section, SectionHead } from "./kit";

const STATS: Array<[string, string]> = [
  ["6", "instruments\nsynths, a sampler and a modular"],
  ["16", "genre templates\nstart from a finished groove"],
  ["0", "installs\nopens in any modern browser"],
  ["100%", "yours\nroyalty-free, saved on your device"],
];

const FEATURES = [
  {
    icon: LayoutGrid,
    title: "Arrange & perform",
    text: "A full arrangement timeline plus a Session grid for launching clips and scenes live.",
  },
  {
    icon: AudioWaveform,
    title: "Synths that go deep",
    text: "The WX-4 wavetable synth, MX-1 guitar & mono leads, SA-2, the AX-3 acid line and a modular Synth Creator.",
  },
  {
    icon: Disc3,
    title: "Samplers & pads",
    text: "Chop any loop on the SX-1, or build kits on 16 pads with a groove sequencer.",
  },
  {
    icon: Compass,
    title: "Studio Assistant",
    text: "Scans your actual notes and mix, then suggests fixes you can apply in one tap.",
  },
  {
    icon: SlidersHorizontal,
    title: "Mix like a pro",
    text: "EQ, dynamics, insert FX, buses, sidechain, automation and a LUFS meter.",
  },
  {
    icon: GraduationCap,
    title: "Learn as you go",
    text: "Hands-on lessons and genre templates that open straight into the studio.",
  },
];

export function Stats() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.05] lg:grid-cols-4">
        {STATS.map(([num, label]) => {
          const [top, bottom] = label.split("\n");
          return (
            <div key={num} className="bg-[#0d0a08] p-5 sm:p-6">
              <div className="text-3xl font-semibold tracking-tight text-[#f0ece4] sm:text-4xl">
                {num}
              </div>
              <div className="mt-1 text-[13px] font-medium text-[#f0ece4]">{top}</div>
              <div className="text-[12px] text-[#a89f91]">{bottom}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Features() {
  return (
    <Section id="features">
      <SectionHead
        kicker="Everything in one studio"
        title="From first idea to finished mix, without leaving the tab"
      />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <Card key={title} className="group hover:border-[#f2a43a]/25">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#f2a43a]/10 ring-1 ring-[#f2a43a]/20">
              <Icon className="h-5 w-5 text-[#f2a43a]" aria-hidden />
            </div>
            <h3 className="text-[16px] font-semibold text-[#f0ece4]">{title}</h3>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#a89f91]">{text}</p>
          </Card>
        ))}
      </div>
    </Section>
  );
}
