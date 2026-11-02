"use client";

import { FolderOpen, Download, Sparkles } from "lucide-react";
import { Section, SectionHead, Card, Chip } from "./kit";
import { SKAZI_DEVICES, SKAZI_FOLDERS, devicesInFolder } from "@/lib/daw/skazi";

const BUNDLE_URL = "https://github.com/slazoasher/skazi-bundle/releases/latest";

export function SkaziBundle({ onOpenStudio }: { onOpenStudio: () => void }) {
  return (
    <Section id="skazi">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <SectionHead
          kicker="SKAZI Bundle · included"
          title="19 free SKAZI tools, built right in"
          sub="Every free plugin from Asher Swissa's SKAZI Bundle — synths, acid basslines, kick & riser machines, a MIDI pattern generator and a 10-slot master FX rack — recreated as browser-native devices inside the studio. No install, no account."
        />
        <div className="flex flex-col gap-2">
          <button
            onClick={onOpenStudio}
            className="flex items-center justify-center gap-2 rounded-xl bg-[#f2a43a] px-5 py-3 font-semibold text-[#17120a] transition-colors hover:bg-[#ffb75c]"
          >
            <Sparkles className="h-4 w-4" />
            Open the SKAZI rack
          </button>
          <a
            href={BUNDLE_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-5 py-2.5 font-mono text-[12px] text-[#a89f91] transition-colors hover:border-[#f2a43a]/40 hover:text-[#f0ece4]"
          >
            <Download className="h-3.5 w-3.5" />
            Get the real VST3 / AU plugins — free
          </a>
        </div>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SKAZI_FOLDERS.map((folder) => {
          const items = devicesInFolder(folder);
          return (
            <Card key={folder} className="flex flex-col gap-3">
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[#f2a43a]">
                <FolderOpen className="h-4 w-4" />
                {folder}
                <span className="ml-auto text-[#a89f91]">{items.length}</span>
              </div>
              <ul className="space-y-2">
                {items.map((d) => (
                  <li key={d.id} className="flex items-start gap-2">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: d.accent }}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold leading-tight text-[#f0ece4]">
                        {d.name}
                      </div>
                      <div className="truncate text-[11px] text-[#a89f91]">{d.tagline}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Chip>Playable in the browser</Chip>
        <Chip>Renders into WAV export</Chip>
        <Chip>16-step sequencers with MUTATE</Chip>
        <Chip>MIDI GOD writes patterns to tracks</Chip>
        <Chip>Master rack on every channel</Chip>
        <Chip>{SKAZI_DEVICES.length} devices · 0 ₪</Chip>
      </div>

      <p className="mt-4 max-w-3xl font-mono text-[11px] leading-relaxed text-[#a89f91]/70">
        The SKAZI Bundle tools by Asher Swissa are rebuilt from scratch as Web Audio devices for
        Intellidaw — same names, same workflow, running entirely in your browser. Prefer the native
        plugins for your desktop DAW? The official bundle is a free download from the releases page.
      </p>
    </Section>
  );
}
