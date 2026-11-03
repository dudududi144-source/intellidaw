"use client";

/* ------------------------------------------------------------------ */
/*  SoundsTab — browse every drum, kit preset and genre template.      */
/* ------------------------------------------------------------------ */

import { memo, useMemo, useState } from "react";
import {
  applyKitPreset,
  KIT_PRESETS,
  TEMPLATES,
  withAutoSections,
  type DrumSound,
  type Project,
} from "@/lib/daw/types";
import { getEngine } from "@/lib/daw/engine";
import { cn } from "@/lib/utils";

const DRUM_LABELS: Array<[DrumSound, string]> = [
  ["kick", "Kick"],
  ["kick2", "Kick 2"],
  ["snare", "Snare"],
  ["clap", "Clap"],
  ["chat", "Closed Hat"],
  ["ohat", "Open Hat"],
  ["perc", "Perc"],
  ["rim", "Rim"],
  ["tom", "Tom"],
  ["conga", "Conga"],
  ["shaker", "Shaker"],
  ["ride", "Ride"],
  ["chop", "Chop"],
  ["vox", "Vox"],
  ["fx", "FX Riser"],
  ["crash", "Crash"],
];

export const SoundsTab = memo(function SoundsTab({
  project,
  updateProject,
}: {
  project: Project;
  updateProject: (fn: (p: Project) => Project) => void;
}) {
  const [q, setQ] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const q2 = q.trim().toLowerCase();
  const drums = useMemo(() => DRUM_LABELS.filter(([, l]) => l.toLowerCase().includes(q2)), [q2]);
  const kits = useMemo(() => KIT_PRESETS.filter((k) => k.name.toLowerCase().includes(q2) || k.tag.toLowerCase().includes(q2)), [q2]);
  const temps = useMemo(() => TEMPLATES.filter((t) => t.name.toLowerCase().includes(q2)), [q2]);

  const play = async (sound: DrumSound) => {
    try {
      await getEngine().previewDrum(sound, 0.95);
      setNote(null);
    } catch {
      setNote("Tap again to unlock audio — the browser needs one more press.");
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/8 bg-[#14100d] p-3.5">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#f2a43a]">
          Sounds · hear it before you place it
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search sounds, kits, templates…"
          className="mt-2 w-full rounded-lg border border-white/8 bg-black/30 px-3 py-2 text-[13px] text-[#f0ece4] outline-none placeholder:text-[#a89f91]/50 focus:border-[#f2a43a]/50"
          aria-label="Search sounds"
        />
        {note && <p className="mt-2 font-mono text-[10px] text-[#f2a43a]">{note}</p>}
      </div>

      <section className="rounded-xl border border-white/8 bg-[#14100d] p-3.5">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#a89f91]">Drums · {drums.length}</h3>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {drums.map(([sound, label]) => (
            <button
              key={sound}
              onClick={() => void play(sound)}
              className="flex items-center gap-2 rounded-lg border border-white/8 bg-black/25 px-2.5 py-2 text-left hover:border-[#f2a43a]/40 hover:bg-white/5"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#f2a43a]/15 font-mono text-[10px] text-[#f2a43a]">▶</span>
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#f0ece4]">{label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-white/8 bg-[#14100d] p-3.5">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#a89f91]">Kit presets · shapes your drums</h3>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {kits.map((k) => (
            <div key={k.name} className="flex items-center gap-2 rounded-lg border border-white/8 bg-black/25 px-2.5 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-semibold text-[#f0ece4]">{k.name}</span>
                <span className="font-mono text-[9px] uppercase tracking-wider text-[#a89f91]">{k.tag}</span>
              </span>
              <button
                onClick={() => updateProject((p) => applyKitPreset(p, k))}
                className="shrink-0 rounded bg-[#f2a43a]/20 px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-[#f2a43a] hover:bg-[#f2a43a]/35"
              >
                apply
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-white/8 bg-[#14100d] p-3.5">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#a89f91]">
          Genre templates · {TEMPLATES.length} full songs
        </h3>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {temps.map((t) => (
            <div key={t.name} className="flex items-center gap-2 rounded-lg border border-white/8 bg-black/25 px-2.5 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-semibold text-[#f0ece4]">{t.name}</span>
                <span className="font-mono text-[9px] uppercase tracking-wider text-[#a89f91]">{t.tag} bpm</span>
              </span>
              <button
                onClick={() => updateProject(() => withAutoSections(t.build()))}
                className={cn(
                  "shrink-0 rounded bg-[#f2a43a]/20 px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-[#f2a43a] hover:bg-[#f2a43a]/35"
                )}
              >
                load
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
});
