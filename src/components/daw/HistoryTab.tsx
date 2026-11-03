"use client";

/* ------------------------------------------------------------------ */
/*  HistoryTab — clickable undo timeline + saved project versions      */
/* ------------------------------------------------------------------ */

import { memo, useCallback, useState } from "react";
import type { Project } from "@/lib/daw/types";
import { cn } from "@/lib/utils";

const VKEY = "intellidaw.versions.v1";

interface Version {
  id: string;
  name: string;
  at: number;
  project: Project;
}

function loadVersions(): Version[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(VKEY);
    return raw ? (JSON.parse(raw) as Version[]) : [];
  } catch {
    return [];
  }
}

function saveVersions(list: Version[]) {
  try {
    localStorage.setItem(VKEY, JSON.stringify(list.slice(-60)));
  } catch {
    /* quota */
  }
}

const fmtTime = (t: number) => {
  const d = new Date(t);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d
    .getSeconds()
    .toString()
    .padStart(2, "0")}`;
};

export const HistoryTab = memo(function HistoryTab({
  project,
  past = [],
  future = [],
  onRestore,
}: {
  project: Project;
  updateProject: (fn: (p: Project) => Project) => void;
  past?: Project[];
  future?: Project[];
  onRestore?: (p: Project) => void;
}) {
  const [versions, setVersions] = useState<Version[]>(() => loadVersions());

  const mine = versions.filter((v) => v.project?.id === project.id);

  const doRestore = useCallback(
    (p: Project, label: string) => {
      onRestore?.(p);
    },
    [onRestore]
  );

  const saveVersion = useCallback(() => {
    const v: Version = {
      id: `v${Date.now()}`,
      name: `${project.name} · ${new Date().toLocaleTimeString()}`,
      at: Date.now(),
      project,
    };
    const all = [...loadVersions(), v];
    // keep max 12 versions per project
    const others = all.filter((x) => x.project?.id !== project.id);
    const sameProj = all.filter((x) => x.project?.id === project.id).slice(-12);
    saveVersions([...others, ...sameProj]);
    setVersions(loadVersions());
  }, [project]);

  const delVersion = useCallback((id: string) => {
    saveVersions(loadVersions().filter((v) => v.id !== id));
    setVersions(loadVersions());
  }, []);

  const rowCls =
    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors";

  return (
    <div className="space-y-3">
      {/* undo timeline */}
      <div className="rounded-xl border border-white/8 bg-[#14100d] p-3.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#f2a43a]">
            Undo timeline
          </span>
          <span className="font-mono text-[9px] text-[#a89f91]">
            {past.length + future.length} states in memory
          </span>
        </div>
        {past.length === 0 && future.length === 0 ? (
          <p className="mt-2 text-[12px] text-[#a89f91]">
            No history yet — every edit you make lands here. Click a state to jump back to it.
          </p>
        ) : (
          <div className="studio-scroll mt-2 max-h-64 space-y-0.5 overflow-y-auto pr-1">
            {past.map((p, i) => (
              <button
                key={`${i}-${p.updatedAt}`}
                onClick={() => doRestore(p, "past")}
                className={cn(rowCls, "bg-black/20 hover:bg-white/8")}
              >
                <span className="w-8 font-mono text-[9px] text-[#a89f91]">−{past.length - i}</span>
                <span className="font-mono text-[10px] text-[#a89f91]">{fmtTime(p.updatedAt)}</span>
                <span className="ml-auto flex gap-1.5 font-mono text-[9px] text-[#a89f91]">
                  <span className="rounded bg-white/8 px-1.5 py-0.5">{p.tracks.length} tr</span>
                  <span className="rounded bg-white/8 px-1.5 py-0.5">{p.bpm} bpm</span>
                  <span className="rounded bg-white/8 px-1.5 py-0.5">{p.songKey}</span>
                </span>
              </button>
            ))}
            <div className="flex items-center gap-2 rounded-lg bg-[#f2a43a]/15 px-2.5 py-2 ring-1 ring-[#f2a43a]/40">
              <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#f2a43a]">now</span>
              <span className="text-[11px] font-semibold text-[#f0ece4]">{project.name}</span>
              <span className="ml-auto font-mono text-[9px] text-[#a89f91]">{project.tracks.length} tracks</span>
            </div>
            {[...future].reverse().map((p, i) => (
              <button
                key={`f${i}-${p.updatedAt}`}
                onClick={() => doRestore(p, "future")}
                className={cn(rowCls, "bg-black/20 hover:bg-white/8")}
              >
                <span className="w-8 font-mono text-[9px] text-[#a89f91]">+{i + 1}</span>
                <span className="font-mono text-[10px] text-[#a89f91]">{fmtTime(p.updatedAt)}</span>
                <span className="ml-auto flex gap-1.5 font-mono text-[9px] text-[#a89f91]">
                  <span className="rounded bg-white/8 px-1.5 py-0.5">{p.tracks.length} tr</span>
                  <span className="rounded bg-white/8 px-1.5 py-0.5">{p.bpm} bpm</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* versions */}
      <div className="rounded-xl border border-white/8 bg-[#14100d] p-3.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#f2a43a]">
            Versions · {project.name}
          </span>
          <button
            onClick={saveVersion}
            className="rounded-lg bg-[#f2a43a] px-3 py-1.5 text-[11px] font-bold text-[#17120a] hover:bg-[#ffb75c]"
          >
            ⬒ Save version
          </button>
        </div>
        {mine.length === 0 ? (
          <p className="mt-2 text-[12px] text-[#a89f91]">
            No saved versions for this project yet — a version is a frozen snapshot you can always come back to.
          </p>
        ) : (
          <div className="studio-scroll mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">
            {[...mine].reverse().map((v) => (
              <div key={v.id} className="flex items-center gap-2 rounded-lg bg-black/25 px-2.5 py-2">
                <span className="font-mono text-[10px] text-[#a89f91]">{fmtTime(v.at)}</span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-[#f0ece4]">{v.name}</span>
                <button
                  onClick={() => doRestore(v.project, "version")}
                  className="rounded bg-[#f2a43a]/20 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-[#f2a43a] hover:bg-[#f2a43a]/35"
                >
                  restore
                </button>
                <button
                  onClick={() => delVersion(v.id)}
                  className="rounded bg-white/8 px-2 py-1 font-mono text-[9px] text-[#a89f91] hover:bg-white/15"
                  aria-label={`Delete version ${v.name}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
