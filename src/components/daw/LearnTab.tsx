"use client";

/* ------------------------------------------------------------------ */
/*  LearnTab — interactive lessons that teach where everything lives.  */
/* ------------------------------------------------------------------ */

import { memo, useState } from "react";
import type { Project } from "@/lib/daw/types";
import { cn } from "@/lib/utils";

interface Lesson {
  id: string;
  title: string;
  goal: string;
  steps: string[];
}

const LESSONS: Lesson[] = [
  {
    id: "beat",
    title: "1 · Make your first beat",
    goal: "Go from silence to a groove in two minutes.",
    steps: [
      "Timeline view → click the Kick lane to open its Notes.",
      "Notes view → click cells 1 and 3 (beats) to place kicks.",
      "Pick the C Hat track in the left sidebar → fill every second cell.",
      "Press PLAY in the transport (or hit Space).",
    ],
  },
  {
    id: "mix",
    title: "2 · Shape the mix",
    goal: "Balance levels and make the kick own the low end.",
    steps: [
      "Select a track → its whole sound chain is in the Device panel on the right.",
      "Mixer view → pull hats down a touch with EQ LOW.",
      "Give Keys some REVERB so they sit behind the beat.",
      "Turn on SIDECHAIN (DUCK) on the Bass — it pumps out of the kick's way.",
    ],
  },
  {
    id: "ideas",
    title: "3 · Generate an idea",
    goal: "Let the Ideas generator write a part in your key.",
    steps: [
      "Ideas view → pick Bassline + a style.",
      "Set Density, then hit PREVIEW to hear it first.",
      "GENERATE writes a brand-new track you can edit in Notes.",
      "MUTATE swaps a few notes while keeping the vibe.",
    ],
  },
  {
    id: "finish",
    title: "4 · Polish & export",
    goal: "From demo to a finished WAV.",
    steps: [
      "Assistant view → SCAN to find clashes and level gaps.",
      "Apply a one-tap fix (undo always works).",
      "Live view → launch sections, ride the master FX.",
      "EXPORT → WAV mixdown, stems or MIDI.",
    ],
  },
];

export const LearnTab = memo(function LearnTab({
  project,
  updateProject,
  onApplyFix,
}: {
  project: Project;
  updateProject: (fn: (p: Project) => Project) => void;
  onApplyFix?: (fix: string) => void;
}) {
  const [open, setOpen] = useState<string | null>("beat");
  const [done, setDone] = useState<Record<string, boolean>>({});

  const toggleStep = (key: string) => setDone((d) => ({ ...d, [key]: !d[key] }));

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/8 bg-[#14100d] p-3.5">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#f2a43a]">
          Learn · four short lessons
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-[#a89f91]">
          Everything happens inside this studio — the lessons point you at the exact view and control. Tick steps as you go.
        </p>
      </div>

      {LESSONS.map((l) => {
        const isOpen = open === l.id;
        const doneCount = l.steps.filter((_, i) => done[`${l.id}:${i}`]).length;
        return (
          <div key={l.id} className="rounded-xl border border-white/8 bg-[#14100d]">
            <button
              onClick={() => setOpen(isOpen ? null : l.id)}
              className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
              aria-expanded={isOpen}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-[#f0ece4]">{l.title}</span>
                <span className="text-[11px] text-[#a89f91]">{l.goal}</span>
              </span>
              <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-[#a89f91]">
                {doneCount}/{l.steps.length}
              </span>
              <span aria-hidden className={cn("shrink-0 text-[10px] text-[#a89f91] transition-transform", isOpen && "rotate-90")}>
                ▸
              </span>
            </button>
            {isOpen && (
              <ol className="space-y-1 px-3.5 pb-3.5">
                {l.steps.map((s, i) => {
                  const key = `${l.id}:${i}`;
                  return (
                    <li key={key}>
                      <button
                        onClick={() => toggleStep(key)}
                        className={cn(
                          "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                          done[key] ? "bg-[#8fbf6b]/10" : "bg-black/25 hover:bg-white/5"
                        )}
                        aria-pressed={!!done[key]}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-[10px] font-bold",
                            done[key] ? "bg-[#8fbf6b] text-[#10130a]" : "bg-white/10 text-[#f2a43a]"
                          )}
                          aria-hidden
                        >
                          {done[key] ? "✓" : i + 1}
                        </span>
                        <span className={cn("text-[12px] leading-relaxed", done[key] ? "text-[#a89f91] line-through" : "text-[#f0ece4]")}>
                          {s}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        );
      })}
    </div>
  );
});
