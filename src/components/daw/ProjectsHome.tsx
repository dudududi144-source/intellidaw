"use client";

/* ------------------------------------------------------------------ */
/*  ProjectsHome — the studio entrance                                 */
/*                                                                     */
/*  Mirrors the original entrance: a "Your Projects" home with a       */
/*  featured "Continue working" banner and a grid whose first row is   */
/*  [New Project] + three project cards with waveform art. Every box   */
/*  opens a real, playable project; cards can be duplicated/deleted.   */
/* ------------------------------------------------------------------ */

import { useMemo, useState } from "react";
import { listProjects, saveProject, deleteProject } from "@/lib/daw/storage";
import { ensureDemoProjects } from "@/lib/daw/demos";
import { uid, type Project } from "@/lib/daw/types";
import { SONG_BARS } from "@/lib/daw/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Entry {
  id: string;
  name: string;
  updatedAt: number;
  project: Project;
}

/* ---------------- helpers ---------------- */

const GENRE_COLORS: Record<string, string> = {
  synthwave: "#f2a43a",
  techno: "#8fd48a",
  "lo-fi": "#f2a43a",
  "lofi": "#f2a43a",
  "deep house": "#6bc5b8",
  house: "#e5c15a",
  trance: "#f2a43a",
  ambient: "#8fbf6b",
  trap: "#e5533d",
  "drum & bass": "#c084fc",
  hiphop: "#d97b5a",
  "hip-hop": "#d97b5a",
  acid: "#d0e05a",
  disco: "#e5c15a",
  reggaeton: "#f2a43a",
  jungle: "#8fd48a",
  "afro house": "#e5a04a",
  drill: "#b8a98f",
  psy: "#f2a43a",
};

const genreColor = (genre?: string) => {
  const g = (genre ?? "").toLowerCase();
  for (const key of Object.keys(GENRE_COLORS)) {
    if (g.includes(key)) return GENRE_COLORS[key];
  }
  return "#f2a43a";
};

/** FNV-1a → deterministic bar heights for the waveform art */
function waveBars(seed: string, n = 44): number[] {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    const t = ((h ^ (h >>> 15)) >>> 0) / 4294967296;
    const env = 0.35 + 0.65 * Math.abs(Math.sin((i / n) * Math.PI * 3.1));
    out.push(Math.max(0.08, Math.min(1, t * env + 0.12)));
  }
  return out;
}

function WaveArt({ seed, color, className }: { seed: string; color: string; className?: string }) {
  const bars = useMemo(() => waveBars(seed), [seed]);
  const mid = bars.length / 2;
  return (
    <svg
      viewBox="0 0 220 56"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      {bars.map((v, i) => {
        const h = Math.max(3, v * 50);
        return (
          <rect
            key={i}
            x={i * 5 + 1}
            y={28 - h / 2}
            width={3.2}
            height={h}
            rx={1.6}
            fill={color}
            opacity={i === Math.floor(mid) ? 0.95 : 0.55 + 0.4 * v}
          />
        );
      })}
    </svg>
  );
}

function timeAgo(ts: number): string {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** 4 bars · 4 beats · BPM → mm:ss */
function duration(bpm: number): string {
  const secs = Math.round((SONG_BARS * 4 * 60) / bpm);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const kb = (list: Entry[]) => {
  try {
    return Math.max(1, Math.round(JSON.stringify(list).length / 1024));
  } catch {
    return 0;
  }
};

/* ---------------- component ---------------- */

export function ProjectsHome({
  onOpen,
  onNew,
  onEnter,
}: {
  onOpen: (p: Project) => void;
  onNew: () => void;
  onEnter: (view: "sounds" | "skazi" | "learn") => void;
}) {
  /* Studio mounts only after a user click, so localStorage is always
     available here — seed the demos lazily, no effect needed */
  const [entries, setEntries] = useState<Entry[] | null>(() => {
    if (typeof window === "undefined") return null;
    ensureDemoProjects();
    return listProjects();
  });
  const [query, setQuery] = useState("");

  const list = entries ?? [];
  const featured = list[0] ?? null;
  const filtered = query.trim()
    ? list.filter((e) => {
        const q = query.trim().toLowerCase();
        return (
          e.name.toLowerCase().includes(q) ||
          (e.project.genre ?? "").toLowerCase().includes(q) ||
          e.project.songKey.toLowerCase().includes(q)
        );
      })
    : list;

  const duplicate = (e: Entry) => {
    const copy: Project = {
      ...e.project,
      id: uid(),
      name: `${e.project.name} copy`.slice(0, 60),
      updatedAt: Date.now(),
    };
    saveProject(copy);
    setEntries(listProjects());
  };

  const remove = (e: Entry) => {
    setEntries(deleteProject(e.id));
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#0d0a08]">
      {/* top bar */}
      <header className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f2a43a] text-[#17120a]">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <path d="M2 12h3l2.5-6 3.5 12 3-8 2 2h6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="text-[15px] font-bold tracking-tight text-[#f0ece4]">Intellidaw</span>
          <span className="rounded border border-[#f2a43a]/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-[#f2a43a]">
            Beta
          </span>
        </div>
        <Button
          onClick={() => featured && onOpen(featured.project)}
          className="bg-[#f2a43a] font-bold text-[#17120a] hover:bg-[#ffb75c]"
        >
          ▶ Open studio
        </Button>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8">
        {/* greeting + actions */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm text-[#a89f91]">{greeting()}</div>
            <h1 className="text-3xl font-extrabold tracking-tight text-[#f0ece4] sm:text-4xl">
              Your Projects
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects…"
              aria-label="Search projects"
              className="w-44 rounded-xl border border-white/8 bg-black/30 px-3.5 py-2.5 text-sm text-[#f0ece4] outline-none placeholder:text-[#a89f91]/60 focus:border-[#f2a43a]/50 sm:w-56"
            />
            <Button
              onClick={onNew}
              className="bg-[#f2a43a] font-bold text-[#17120a] hover:bg-[#ffb75c]"
            >
              + New Project
            </Button>
          </div>
        </div>

        {/* featured — continue working */}
        {featured && !query && (
          <section
            className="relative mt-6 overflow-hidden rounded-2xl border border-[#f2a43a]/20"
            aria-label="Continue working"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-[#241a0c] via-[#2d2010] to-[#1a1207]" aria-hidden="true" />
            <div className="relative flex flex-wrap items-center gap-6 px-6 py-7 sm:px-8">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#f2a43a]">
                  ● Continue working
                </div>
                <div className="mt-1.5 truncate text-2xl font-extrabold tracking-tight text-[#f0ece4]">
                  {featured.project.name}
                </div>
                <div className="mt-1 font-mono text-[11px] text-[#a89f91]">
                  {featured.project.genre ?? "Project"} · {featured.project.bpm} BPM ·{" "}
                  {featured.project.songKey} · Edited {timeAgo(featured.updatedAt)}
                </div>
              </div>
              <WaveArt
                seed={featured.id}
                color={genreColor(featured.project.genre)}
                className="hidden h-14 flex-1 opacity-70 sm:block"
              />
              <Button
                onClick={() => onOpen(featured.project)}
                size="lg"
                className="bg-[#fdf9f2] font-bold text-[#17120a] hover:bg-white"
              >
                ▶ Open Studio
              </Button>
            </div>
          </section>
        )}

        {/* all projects grid */}
        <div className="mt-8 flex items-baseline justify-between">
          <div className="text-lg font-bold text-[#f0ece4]">
            All projects{" "}
            <span className="ml-1 font-mono text-xs font-normal text-[#a89f91]">
              {filtered.length} project{filtered.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* New Project box — first box, like the original */}
          <button
            onClick={onNew}
            className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 bg-[#120e0b] transition hover:border-[#f2a43a]/50 hover:bg-[#181209]"
            aria-label="New project — start from a blank session"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f2a43a] text-2xl font-bold text-[#17120a]">
              +
            </span>
            <span className="text-base font-bold text-[#f0ece4]">New Project</span>
            <span className="font-mono text-[10px] text-[#a89f91]">Start from a blank session</span>
          </button>

          {filtered.map((e) => {
            const color = genreColor(e.project.genre);
            return (
              <div
                key={e.id}
                className="group flex min-h-[220px] flex-col overflow-hidden rounded-2xl border border-white/8 bg-[#120e0b] transition hover:border-white/20"
              >
                {/* art */}
                <button
                  onClick={() => onOpen(e.project)}
                  className="relative block flex-1 cursor-pointer text-left"
                  aria-label={`Open ${e.project.name}`}
                >
                  <div className="flex items-center justify-between px-3 pt-3">
                    <span
                      className="rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider"
                      style={{ backgroundColor: `${color}26`, color }}
                    >
                      {e.project.genre ?? "Project"}
                    </span>
                    <span className="flex items-center gap-1 rounded bg-black/40 px-1.5 py-0.5 font-mono text-[9px] text-[#a89f91]">
                      ⇄ LINEAR
                    </span>
                  </div>
                  <WaveArt seed={e.id} color={color} className="mt-2 h-14 w-full px-3 opacity-80" />
                  <div className="px-3.5 pt-2">
                    <div className="truncate text-[15px] font-bold text-[#f0ece4]">{e.project.name}</div>
                    <div className="font-mono text-[10px] text-[#a89f91]">
                      {e.project.bpm} BPM · {e.project.songKey} · {e.project.tracks.length} tracks
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-[#a89f91]/70">
                      {duration(e.project.bpm)} · Edited {timeAgo(e.updatedAt)}
                    </div>
                  </div>
                </button>
                {/* actions */}
                <div className="flex items-center justify-between border-t border-white/5 px-3 py-2">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[#a89f91]/60">
                    {e.id === featured?.id ? "latest" : "\u00A0"}
                  </span>
                  <div className="flex items-center gap-1 opacity-70 transition group-hover:opacity-100">
                    <button
                      onClick={() => duplicate(e)}
                      className="rounded px-1.5 py-1 text-xs text-[#a89f91] hover:bg-white/5 hover:text-[#f0ece4]"
                      aria-label={`Duplicate ${e.project.name}`}
                      title="Duplicate"
                    >
                      ⧉
                    </button>
                    <button
                      onClick={() => remove(e)}
                      className="rounded px-1.5 py-1 text-xs text-[#a89f91] hover:bg-[#e5533d]/10 hover:text-[#ff9a8a]"
                      aria-label={`Delete ${e.project.name}`}
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && query && (
          <div className="mt-6 rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-[#a89f91]">
            No projects match “{query}”.
          </div>
        )}

        {/* jump back in */}
        <div className="mt-8 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#a89f91]">
            Jump back in
          </span>
          {(
            [
              ["sounds", "Sounds"],
              ["skazi", "SKAZI devices"],
              ["learn", "Learn"],
            ] as const
          ).map(([view, label]) => (
            <button
              key={view}
              onClick={() => onEnter(view)}
              className={cn(
                "rounded-full border border-white/10 bg-[#151009] px-3.5 py-1.5 text-xs font-semibold text-[#f0ece4]",
                "transition hover:border-[#f2a43a]/50 hover:bg-[#1d150a]"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </main>

      {/* footer strip */}
      <footer className="mt-auto border-t border-white/5 px-4 py-3 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-[#a89f91]">
          <span>
            Project data ~{kb(list)} KB · Saved on this device · {list.length} project
            {list.length === 1 ? "" : "s"}
          </span>
          <span>Guest session · no login · nothing leaves your browser</span>
        </div>
      </footer>
    </div>
  );
}
