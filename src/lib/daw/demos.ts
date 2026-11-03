/* ------------------------------------------------------------------ */
/*  Demo projects — the "Your Projects" entrance seeds                 */
/*                                                                     */
/*  The original studio opens on a projects grid whose first row is    */
/*  [New Project] + three demo projects. We do the same: three REAL,   */
/*  playable projects (built from the genre templates) are written     */
/*  into local storage exactly once, then they behave like any other   */
/*  project — open, edit, duplicate, delete.                          */
/* ------------------------------------------------------------------ */

import { TEMPLATES, type Project } from "./types";
import { deleteProject, listProjects, saveProject } from "./storage";

const DEMOS_FLAG = "intellidaw.demos.v2";

interface DemoSpec {
  template: string;
  name: string;
  genre: string;
  bpm?: number;
  /** minutes ago — staggered so "edited X ago" reads like the original */
  ago: number;
}

const DEMO_SPECS: DemoSpec[] = [
  { template: "Synthwave", name: "Midnight Drive", genre: "Synthwave", bpm: 84, ago: 43 },
  { template: "Techno", name: "Neon Pulse", genre: "Techno", ago: 6 * 60 },
  { template: "Lo-fi", name: "Golden Hour", genre: "Lo-Fi", ago: 24 * 60 },
];

/** Build one demo project from a genre template. */
function buildDemo(spec: DemoSpec): Project {
  const tpl = TEMPLATES.find((t) => t.name === spec.template) ?? TEMPLATES[0];
  const p = tpl.build();
  return {
    ...p,
    name: spec.name,
    genre: spec.genre,
    ...(spec.bpm ? { bpm: spec.bpm } : {}),
    updatedAt: Date.now() - spec.ago * 60_000,
  };
}

/**
 * Make sure the three demo projects exist exactly once.
 * Idempotent: the flag survives reloads; deleting a demo afterwards is
 * a user choice and is respected (no re-seed).
 */
export function ensureDemoProjects(): void {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(DEMOS_FLAG)) return;
    const byName = new Map(listProjects().map((e) => [e.name, e]));
    for (const spec of DEMO_SPECS) {
      /* replace any stale copy (older seed or user-touched name collision)
         so the staggered "edited X ago" timestamps always apply */
      const stale = byName.get(spec.name);
      if (stale) deleteProject(stale.id);
      saveProject(buildDemo(spec));
    }
    localStorage.setItem(DEMOS_FLAG, "1");
  } catch {
    /* storage unavailable — the grid just shows saved projects */
  }
}
