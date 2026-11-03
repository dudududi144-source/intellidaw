"use client";

import { ArrowRight, Download, FolderOpen, Sparkles } from "lucide-react";
import { Section, SectionHead, Card, Chip } from "./kit";
import {
  SKAZI_DEVICES,
  SKAZI_FOLDERS,
  devicesInFolder,
  isExtraDevice,
  requestDeviceSelect,
  type SkaziDevice,
  type SkaziKind,
} from "@/lib/daw/skazi";
import { bankTotal } from "@/lib/daw/presetBank";

const BUNDLE_URL = "https://github.com/slazoasher/skazi-bundle/releases/latest";

/** human-readable badge label for every device kind */
const KIND_LABEL: Record<SkaziKind, string> = {
  synth: "Instrument",
  sequencer: "Sequencer",
  kick: "Instrument",
  riser: "Instrument",
  generator: "MIDI",
  fx: "Effect",
};

function DeviceCard({ d, onTry }: { d: SkaziDevice; onTry: (id: string) => void }) {
  const presets = d.presetsCount ?? 0;
  const extra = isExtraDevice(d);
  // full feature inventory when present, otherwise the device's top param labels
  const feats = (d.features ?? d.params.map((p) => p.label)).slice(0, 3);

  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.accent }} aria-hidden />
        <h3 className="font-mono text-[15px] font-bold tracking-wide text-[#f0ece4]">{d.name}</h3>
        <span className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#a89f91]">
          {KIND_LABEL[d.kind]}
        </span>
        {extra && (
          <span className="rounded border border-[#7fd4c1]/25 bg-[#7fd4c1]/[0.06] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#7fd4c1]">
            Intellidaw original
          </span>
        )}
        {presets > 0 && (
          <span className="ml-auto rounded-full bg-[#f2a43a]/10 px-2 py-0.5 font-mono text-[10px] text-[#f2a43a]">
            {presets.toLocaleString()} presets
          </span>
        )}
      </div>

      <p className="truncate text-[12px] leading-relaxed text-[#a89f91]" title={d.tagline}>
        {d.tagline}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {feats.map((feat) => (
          <Chip key={feat} className="min-w-0 max-w-full px-2 py-0.5 text-[9px]">
            <span className="min-w-0 truncate">{feat}</span>
          </Chip>
        ))}
      </div>

      <div className="mt-auto pt-1">
        <button
          type="button"
          onClick={() => onTry(d.id)}
          aria-label={`Try ${d.name} in the studio`}
          className="group inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-[#a89f91] transition-colors hover:border-[#f2a43a]/50 hover:bg-[#f2a43a]/10 hover:text-[#ffb75c]"
        >
          Try it
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </button>
      </div>
    </Card>
  );
}

export function SkaziBundle({ onOpenStudio }: { onOpenStudio: () => void }) {
  const tryDevice = (id: string) => {
    requestDeviceSelect(id);
    onOpenStudio();
  };

  return (
    <Section id="skazi">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <SectionHead
          kicker="SKAZI Bundle · included"
          title={`All ${SKAZI_DEVICES.length} SKAZI devices, built right in`}
          sub={`Every device ships with presets, RANDOM, A/B compare and undo — the official bundle's own promise, now running in your browser. ${SKAZI_DEVICES.length} devices · ${bankTotal().toLocaleString()} presets · 0 ₪. No install, no account.`}
        />
        <button
          onClick={onOpenStudio}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#f2a43a] px-5 py-3 font-semibold text-[#17120a] transition-colors hover:bg-[#ffb75c]"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          Open the SKAZI rack
        </button>
      </div>

      {SKAZI_FOLDERS.map((folder, fi) => {
        const items = devicesInFolder(folder);
        const extra = folder === "Intellidaw Extras";
        const folderPresets = items.reduce((s, d) => s + (d.presetsCount ?? 0), 0);
        return (
          <div
            key={folder}
            role="group"
            aria-label={`${folder} devices`}
            className={fi === 0 ? "mt-10" : "mt-14"}
          >
            <div
              className="sticky top-16 z-10 -mx-1 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/[0.06] bg-[#0a0807]/90 px-1 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] backdrop-blur-sm"
              style={{ color: extra ? "#7fd4c1" : "#f2a43a" }}
            >
              <FolderOpen className="h-4 w-4" aria-hidden />
              {folder}
              <span className="text-[#a89f91]">
                {items.length} {items.length === 1 ? "device" : "devices"}
              </span>
              <span className="ml-auto text-[#a89f91]">{folderPresets.toLocaleString()} presets</span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((d) => (
                <DeviceCard key={d.id} d={d} onTry={tryDevice} />
              ))}
            </div>
          </div>
        );
      })}

      <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/[0.06] bg-[#14100d]/60 px-4 py-3">
        <p className="min-w-0 flex-1 basis-64 font-mono text-[11px] leading-relaxed text-[#a89f91]/80">
          The SKAZI Bundle tools by Asher Swissa, rebuilt from scratch as Web Audio devices — same
          names, same workflow, running entirely in your browser. Prefer native plugins for your
          desktop DAW? The official bundle is a free download.
        </p>
        <a
          href={BUNDLE_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Download the official SKAZI Bundle VST3 and AU plugins — free (opens in a new tab)"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 font-mono text-[11px] text-[#a89f91] transition-colors hover:border-[#f2a43a]/40 hover:text-[#f0ece4]"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          Real VST3 / AU plugins · free
        </a>
      </div>
    </Section>
  );
}
