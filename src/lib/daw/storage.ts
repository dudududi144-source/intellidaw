/* ------------------------------------------------------------------ */
/*  Local project storage — no login, everything stays on the device   */
/* ------------------------------------------------------------------ */

import type { Project } from "./types";

const KEY = "intellidaw.projects.v1";
const CURRENT = "intellidaw.current.v1";

interface StoredProject {
  id: string;
  name: string;
  updatedAt: number;
  project: Project;
}

function readAll(): StoredProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredProject[];
  } catch {
    return [];
  }
}

function writeAll(list: StoredProject[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full — ignore */
  }
}

export function listProjects(): StoredProject[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveProject(project: Project): StoredProject[] {
  const list = readAll().filter((p) => p.id !== project.id);
  const entry: StoredProject = {
    id: project.id,
    name: project.name,
    updatedAt: Date.now(),
    project,
  };
  list.push(entry);
  writeAll(list);
  return listProjects();
}

export function deleteProject(id: string): StoredProject[] {
  const list = readAll().filter((p) => p.id !== id);
  writeAll(list);
  return listProjects();
}

export function isValidProject(p: unknown): p is Project {
  if (!p || typeof p !== "object") return false;
  const o = p as Project;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.bpm === "number" &&
    Array.isArray(o.tracks) &&
    o.tracks.length > 0 &&
    Array.isArray(o.pads)
  );
}

export function saveCurrent(project: Project) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CURRENT, JSON.stringify(project));
  } catch {
    /* ignore */
  }
}

export function loadCurrent(): Project | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CURRENT);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValidProject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function downloadJson(project: Project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${project.name.replace(/[^\w\- ]+/g, "")}.intellidaw.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
