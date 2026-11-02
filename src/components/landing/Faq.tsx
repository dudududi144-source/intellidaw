"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Section, SectionHead } from "./kit";
import { WaveIcon } from "@/components/daw/Studio";

const FAQS: Array<[string, string]> = [
  [
    "What is Intellidaw?",
    "Intellidaw is a free online DAW (digital audio workstation) that runs in your web browser. It includes six instruments, a 16-pad sampler, a drum sequencer, a mixer with effects and automation, a Session view for launching clips live, and a Studio Assistant that reviews your song and suggests fixes.",
  ],
  [
    "Is Intellidaw really free?",
    "Yes. Every instrument, effect, template and lesson is in the app today at no cost. There is no trial, no credit card and no watermark on exports.",
  ],
  [
    "Do I need to install anything?",
    "No. It runs in Chrome, Edge, Safari and Firefox. You can also install it as an app from the browser menu so it opens in its own window and works offline.",
  ],
  [
    "Is Intellidaw good for beginners?",
    "Yes. Start from one of 16 genre templates or a demo song, or follow hands-on lessons that open straight into the studio. The Studio Assistant points out problems such as out-of-key notes or a kick and bass clash and can fix most of them in one tap.",
  ],
  [
    "Can I release music I make with Intellidaw?",
    "Yes. You keep all rights to what you make, and the built-in sounds, kits and presets are royalty-free for your own productions, including commercial releases. You just can't resell them as standalone sample packs or preset banks.",
  ],
  [
    "Can Intellidaw sound like a real guitar?",
    "Yes. The MX-1 Mono synth models a plucked or bowed string, then runs it through wah, talk box, amp, cabinet and a feedback howl, so it covers clean, crunch, fuzz and slide guitar tones as well as supersaw and sync leads.",
  ],
  [
    "Where are my projects saved?",
    "On your device, in the browser's storage. Nothing is uploaded. Export a project file any time to back it up or move it to another computer.",
  ],
  [
    "Can I use my MIDI keyboard or controller?",
    "Yes. Plug it in and press the MIDI pill in the studio. Notes, velocity, pitch bend and the mod wheel all work, and you can map controller knobs to synth parameters.",
  ],
  [
    "What can I export?",
    "WAV mixdowns, individual stems, MIDI files and full project files. Loudness is measured in LUFS so you know how loud your master is before you share it.",
  ],
  [
    "Does it work on a phone or tablet?",
    "Yes. Phones get their own layout with a bottom tab bar for Tracks, Arrange, Session, Mixer, Instruments, Keys, FX and the assistant, with every instrument playable by touch.",
  ],
  [
    "Can I load my own samples?",
    "Yes. Drop WAV or MP3 files onto the SX-1 Sampler or the 16-pad sampler, and load your own single-cycle or Serum-style wavetables into the WX-4.",
  ],
];

export function Faq() {
  return (
    <Section id="faq">
      <SectionHead
        kicker="FAQ"
        title="Questions, answered"
        sub="The short version: it's free, it runs in your browser and your music stays on your device."
      />
      <div className="mt-8 max-w-3xl">
        <Accordion type="single" collapsible className="w-full">
          {FAQS.map(([q, a], i) => (
            <AccordionItem key={i} value={`item-${i}`} className="border-white/[0.07]">
              <AccordionTrigger className="py-4 text-left text-[15px] font-medium text-[#f0ece4] hover:text-[#f2a43a] hover:no-underline">
                {q}
              </AccordionTrigger>
              <AccordionContent className="text-[14px] leading-relaxed text-[#a89f91]">
                {a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Section>
  );
}

export function FinalCta({ onOpenStudio }: { onOpenStudio: () => void }) {
  const chips = ["SX-1", "SA-2", "AX-3", "WX-4", "MX-1", "Creator"];
  const chipSubs = ["Sampler", "Stock synth", "Acid", "Wavetable", "Guitar and mono", "Modular"];
  return (
    <Section>
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-b from-[#17120d] to-[#0f0c0a] px-6 py-14 text-center sm:px-10">
        <div
          className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-[#f2a43a]/[0.09] blur-3xl"
          aria-hidden
        />
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#f2a43a]">
          Free forever
        </div>
        <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-[#f0ece4] sm:text-5xl">
          Your next track starts here
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-[#a89f91]">
          Jump straight in as a guest — no account, no email, no password. Six instruments, a
          full mixer and the assistant are ready when you are.
        </p>
        <button
          onClick={onOpenStudio}
          className="mt-7 rounded-xl bg-[#f2a43a] px-8 py-4 text-[16px] font-semibold text-[#17120a] shadow-[0_10px_40px_-10px_rgba(242,164,58,0.5)] transition-all hover:bg-[#ffb75c]"
        >
          Start creating free
        </button>
        <div className="mt-9 flex flex-wrap items-start justify-center gap-x-7 gap-y-4">
          {chips.map((c, i) => (
            <div key={c} className="text-left">
              <div className="text-[13px] font-bold tracking-tight text-[#f0ece4]">{c}</div>
              <div className="font-mono text-[9px] uppercase tracking-wider text-[#a89f91]">
                {chipSubs[i]}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function Footer() {
  const cols: Array<[string, Array<[string, string]>]> = [
    [
      "Product",
      [
        ["Features", "#features"],
        ["Instruments", "#instruments"],
        ["Sampler Kits", "#kits"],
        ["Assistant", "#assistant"],
        ["Mixing", "#mixing"],
        ["Perform", "#perform"],
      ],
    ],
    [
      "Get started",
      [
        ["Open studio", "#top"],
        ["How it works", "#how"],
        ["FAQ", "#faq"],
        ["What's new", "#features"],
      ],
    ],
    [
      "Legal",
      [
        ["Privacy", "#"],
        ["Terms", "#"],
        ["Cookies", "#"],
        ["Licenses", "#"],
      ],
    ],
  ];
  return (
    <footer className="mt-auto border-t border-white/[0.06] bg-[#0c0a08]">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.2fr_2fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1d1815] ring-1 ring-white/10">
                <WaveIcon className="h-5 w-5 text-[#f2a43a]" />
              </span>
              <span className="text-[17px] font-bold tracking-tight text-[#f0ece4]">Intellidaw</span>
              <span className="rounded-full border border-[#f2a43a]/40 px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-[#f2a43a]">
                Beta
              </span>
            </div>
            <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-[#a89f91]">
              A complete music studio in your browser: six instruments, a 16-pad sampler, a full
              mixer and an assistant that listens to your song.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 font-mono text-[9px] uppercase tracking-wider text-[#8fbf6b]">
              <span className="rounded-full bg-[#8fbf6b]/10 px-2.5 py-1">Free</span>
              <span className="rounded-full bg-[#8fbf6b]/10 px-2.5 py-1">Works offline</span>
              <span className="rounded-full bg-[#8fbf6b]/10 px-2.5 py-1">Installable app</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {cols.map(([title, links]) => (
              <nav key={title} aria-label={title}>
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#a89f91]">
                  {title}
                </div>
                <ul className="mt-3 space-y-2">
                  {links.map(([l, href]) => (
                    <li key={l}>
                      <a
                        href={href}
                        className="text-[13.5px] text-[#c9c0b2] transition-colors hover:text-[#f2a43a]"
                      >
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>
        <div className="mt-10 flex flex-col items-start justify-between gap-2 border-t border-white/[0.05] pt-6 font-mono text-[11px] text-[#a89f91]/70 sm:flex-row sm:items-center">
          <span>© 2026 Intellidaw · Intelligent Music Studio</span>
          <span>Projects stay on your device — nothing is uploaded.</span>
        </div>
      </div>
    </footer>
  );
}
