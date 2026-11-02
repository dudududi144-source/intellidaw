"use client";

import { ArrowDownToLine, Brain, Clock4, Grid3x3, MonitorSmartphone, Music4, Piano, Save } from "lucide-react";
import { Card, Chip, EqBars, Section, SectionHead } from "./kit";

const DETAILS: Array<{
  icon: React.ComponentType<{ className?: string }>;
  chip: string;
  title: string;
  text: string;
  mock: React.ReactNode;
}> = [
  {
    icon: Grid3x3,
    chip: "Beat sequencer · 16 · 1/16",
    title: "Beat Sequencer",
    text: "Step lanes for chance, ratchets, decay and throws on every drum.",
    mock: (
      <div className="space-y-1.5">
        {["KICK", "SNARE", "HAT", "PERC"].map((n, r) => (
          <div key={n} className="flex items-center gap-2">
            <span className="w-9 font-mono text-[7px] text-[#a89f91]">{n}</span>
            <div className="grid flex-1 grid-cols-16 gap-0.5">
              {Array.from({ length: 16 }, (_, i) => (
                <span
                  key={i}
                  className={
                    (r === 0 && [0, 4, 8, 12].includes(i)) ||
                    (r === 1 && [4, 12].includes(i)) ||
                    (r === 2 && [2, 6, 10, 14].includes(i)) ||
                    (r === 3 && [7, 15].includes(i))
                      ? "h-2 rounded-[2px] bg-[#f2a43a]"
                      : "h-2 rounded-[2px] bg-white/[0.05]"
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: Piano,
    chip: "Piano roll · Note FX · Vel",
    title: "Piano roll Note FX",
    text: "Velocity, chance, ratchet, nudge, bend and filter per note.",
    mock: (
      <div className="space-y-1">
        {[3, 2, 4, 1, 3].map((row, i) => (
          <div key={i} className="relative h-2.5 rounded-sm bg-white/[0.04]">
            <span
              className="absolute top-0 h-full rounded-[2px] bg-[#8fbf6b]"
              style={{ left: `${[10, 30, 45, 65, 80][i]}%`, width: `${18 + i * 4}%` }}
            />
          </div>
        ))}
        <div className="pt-1 font-mono text-[8px] text-[#a89f91]">NOTE FX · VEL · CHANCE</div>
      </div>
    ),
  },
  {
    icon: Brain,
    chip: "Ideas · A minor · Bars 1–4",
    title: "Ideas dock",
    text: "Reads your key and chords, then writes basslines and parts that fit.",
    mock: (
      <div className="grid grid-cols-4 gap-1">
        {["Am", "F", "C", "G"].map((c, i) => (
          <div key={c} className="rounded-md bg-white/[0.05] p-1.5 text-center">
            <div className="font-mono text-[7px] text-[#a89f91]">BAR {i + 1}</div>
            <div className="text-[11px] font-bold text-[#f0ece4]">{c}</div>
          </div>
        ))}
        <div className="col-span-4 pt-1 font-mono text-[8px] text-[#8fbf6b]">Writing bassline…</div>
      </div>
    ),
  },
  {
    icon: Clock4,
    chip: "History · 4 steps",
    title: "History & versions",
    text: "A clickable undo timeline plus saved versions of every project.",
    mock: (
      <div className="space-y-1.5">
        {[
          ["Added Pad track", "12:41", false],
          ["Snap notes to key", "12:43", false],
          ["Duplicate bars 1–4", "12:44", false],
          ["Delete Lead clip", "UNDONE", true],
        ].map(([t, time, struck]) => (
          <div key={String(t)} className="flex items-center justify-between font-mono text-[8.5px]">
            <span className={struck ? "text-[#a89f91]/50 line-through" : "text-[#f0ece4]"}>{t}</span>
            <span className="text-[#a89f91]">{time}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: ArrowDownToLine,
    chip: "Export · 24-bit · 48 kHz",
    title: "Export anything",
    text: "WAV mixdowns, stems, MIDI files and project files.",
    mock: (
      <div className="space-y-1">
        <div className="flex items-center justify-between rounded-md bg-white/[0.05] px-2 py-1 font-mono text-[8px] text-[#f0ece4]">
          <span>Drums.wav</span><span className="text-[#8fbf6b]">✓</span>
        </div>
        <div className="flex items-center justify-between rounded-md bg-white/[0.05] px-2 py-1 font-mono text-[8px] text-[#f0ece4]">
          <span>Bass.wav</span><span className="text-[#8fbf6b]">✓</span>
        </div>
        <div className="flex items-center justify-between rounded-md bg-white/[0.05] px-2 py-1 font-mono text-[8px] text-[#a89f91]">
          <span>Rendering stems…</span><EqBars count={3} className="h-2" />
        </div>
      </div>
    ),
  },
  {
    icon: Music4,
    chip: "Templates · 16 songs",
    title: "Genre templates",
    text: "Full songs with mixed drums, automation and buses to remix.",
    mock: (
      <div className="grid grid-cols-2 gap-1">
        {[["House", "124"], ["Techno", "132"], ["Lo-fi", "82"], ["Acid", "128"]].map(([n, b]) => (
          <div key={n} className="flex items-center justify-between rounded-md bg-white/[0.05] px-2 py-1.5">
            <span className="text-[10px] font-semibold text-[#f0ece4]">{n}</span>
            <span className="font-mono text-[8px] text-[#a89f91]">{b}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: Save,
    chip: "Lesson 4 · Groove lanes",
    title: "Learn by doing",
    text: "Interactive lessons that open right in the studio.",
    mock: (
      <div className="space-y-1">
        {[
          ["Open the Pad Sampler", true],
          ["Add ratchets on step 15", true],
          ["Nudge the snare late", false],
        ].map(([t, done]) => (
          <div key={String(t)} className="flex items-center gap-1.5 font-mono text-[8.5px]">
            <span className={done ? "text-[#8fbf6b]" : "text-white/20"}>{done ? "✓" : "○"}</span>
            <span className={done ? "text-[#a89f91] line-through" : "text-[#f0ece4]"}>{t}</span>
          </div>
        ))}
        <div className="pt-0.5 text-right font-mono text-[8px] text-[#f2a43a]">TRY IT →</div>
      </div>
    ),
  },
  {
    icon: MonitorSmartphone,
    chip: "Installed · Offline",
    title: "Works everywhere",
    text: "Installs as an app, works offline and has a full phone layout.",
    mock: (
      <div className="flex items-center justify-center gap-2 py-1">
        <span className="rounded-md bg-white/[0.05] px-2 py-1 font-mono text-[8px] text-[#f0ece4]">PWA</span>
        <span className="rounded-md bg-white/[0.05] px-2 py-1 font-mono text-[8px] text-[#f0ece4]">Offline</span>
        <span className="rounded-md bg-white/[0.05] px-2 py-1 font-mono text-[8px] text-[#f0ece4]">Phone layout</span>
      </div>
    ),
  },
];

export function Details() {
  return (
    <Section>
      <SectionHead
        kicker="And a lot more"
        title="The details that make it a studio"
        sub="Everything here is in the app today, free, on this device."
      />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {DETAILS.map(({ icon: Icon, chip, title, text, mock }) => (
          <Card key={title} className="flex flex-col gap-3 hover:border-[#f2a43a]/25">
            <div className="rounded-lg border border-white/[0.05] bg-black/30 p-3">{mock}</div>
            <div>
              <Chip className="mb-2">{chip}</Chip>
              <div className="flex items-center gap-2 text-[15px] font-semibold text-[#f0ece4]">
                <Icon className="h-4 w-4 text-[#f2a43a]" aria-hidden />
                {title}
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[#a89f91]">{text}</p>
            </div>
          </Card>
        ))}
      </div>
    </Section>
  );
}

const STEPS: Array<[string, string, string]> = [
  ["01", "Pick a starting point", "Open a blank session, one of 16 genre templates, a demo song or an interactive lesson."],
  ["02", "Build the song", "Draw notes, program drums, chop samples on the SX-1 and shape sounds on six instruments."],
  ["03", "Polish and export", "Let the assistant spot clashes and balance the mix, then export a WAV, stems or MIDI."],
];

export function HowItWorks() {
  return (
    <Section>
      <SectionHead
        kicker="How it works"
        title="Three steps from a blank page to a finished WAV"
        sub="No downloads, no plug-ins to install and no sign-up wall — open the studio and start."
      />
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {STEPS.map(([num, title, text]) => (
          <Card key={num} className="relative overflow-hidden">
            <span className="absolute -right-2 -top-6 font-mono text-[88px] font-bold leading-none text-white/[0.04]">
              {num}
            </span>
            <div className="font-mono text-[11px] tracking-[0.2em] text-[#f2a43a]">{num}</div>
            <h3 className="mt-2 text-lg font-semibold text-[#f0ece4]">{title}</h3>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#a89f91]">{text}</p>
          </Card>
        ))}
      </div>
    </Section>
  );
}
