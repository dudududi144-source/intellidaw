"use client";

/* ------------------------------------------------------------------ */
/*  PresetBrowser — full-preset browser for a SKAZI device             */
/*                                                                     */
/*  Browses the deterministic procedural bank (presetBank.ts): search, */
/*  category chips, favorites (localStorage), prev/next/random dice,   */
/*  A/B compare + UNDO. Clicking a row applies the preset WITHOUT      */
/*  closing the dialog (audition workflow) and plays a preview note.   */
/* ------------------------------------------------------------------ */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Star } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { skaziStore, type SkaziDevice, type SkaziState } from "@/lib/daw/skazi";
import {
  bankCategories,
  bankCount,
  fmtIndex,
  randomBankIndex,
  searchBank,
  type BankPreset,
} from "@/lib/daw/presetBank";
import { getEngine } from "@/lib/daw/engine";
import { cn } from "@/lib/utils";

/* ---------------- favorites (localStorage) ---------------- */

export type PresetFavMap = Record<string, number[]>;
const FAV_KEY = "intellidaw.presetFavs.v1"; // shape: { [deviceId]: number[] }

export function loadPresetFavs(): PresetFavMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: PresetFavMap = {};
    for (const [id, list] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(list)) out[id] = list.filter((n): n is number => typeof n === "number");
    }
    return out;
  } catch {
    return {};
  }
}

function savePresetFavs(map: PresetFavMap): void {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(map));
  } catch {
    /* storage full — ignore */
  }
}

/** toggle one favorite, persist, and return the fresh map */
export function togglePresetFav(deviceId: string, index: number): PresetFavMap {
  const map = loadPresetFavs();
  const cur = map[deviceId] ?? [];
  map[deviceId] = cur.includes(index) ? cur.filter((i) => i !== index) : [...cur, index].sort((a, b) => a - b);
  savePresetFavs(map);
  return map;
}

/* ---------------- audition helper (shared with the inline PresetBar) ---------------- */

/** play a short preview note for the freshly applied preset (never throws) */
export function auditionBankPreset(device: SkaziDevice, index: number): void {
  try {
    const engine = getEngine();
    if (device.kind === "synth") {
      void engine.previewSkazi(device.id, 48 + (index % 12), 0.5).catch(() => {});
    } else if (device.kind === "sequencer") {
      void engine
        .previewSkaziSeqNote(device.id as "tbon303" | "skacid", 36 + (index % 12), index % 4 === 0)
        .catch(() => {});
    } else if (device.kind === "kick") {
      void engine.previewSkazi(device.id, 36, 0.01).catch(() => {});
    }
  } catch {
    /* audio not ready — silent */
  }
}

/* ---------------- browser ---------------- */

function useSkaziState(): SkaziState {
  return useSyncExternalStore(skaziStore.subscribe, skaziStore.get, skaziStore.get);
}

const WINDOW = 250; // max rows rendered at once

/** per-open state lives here — Radix unmounts content on close, so state
 *  (query/category/favorites) resets naturally on every open, no effects needed */
function PresetBrowserInner({ device, onClose }: { device: SkaziDevice; onClose: () => void }) {
  const state = useSkaziState();
  const [, setAbTick] = useState(0); // forces re-render after abStore (runtime-only state)
  const searchRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [favsOnly, setFavsOnly] = useState(false);
  const [favMap, setFavMap] = useState<PresetFavMap>(() => loadPresetFavs());

  const n = bankCount(device);
  const cats = bankCategories(device);

  // "/" focuses the search field while open (Escape handled by Dialog)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const favs = favMap[device.id] ?? [];

  const results = useMemo<{ items: BankPreset[]; total: number }>(() => {
    if (n <= 0) return { items: [], total: 0 };
    return searchBank(device, query, cat, favsOnly ? favs : null, WINDOW);
  }, [device, query, cat, favsOnly, favs, n]);

  const cur = state.lastPreset?.[device.id] ?? null;
  const abOn = skaziStore.abActive(device.id);

  const apply = (index: number) => {
    skaziStore.applyBankPreset(device.id, index);
    auditionBankPreset(device, index);
  };

  const onAB = () => {
    if (!skaziStore.abActive(device.id)) {
      skaziStore.abStore(device.id);
      setAbTick((t) => t + 1); // abStore is runtime-only → no store emit
    } else {
      skaziStore.abToggle(device.id);
    }
  };

  const onStar = (index: number) => {
    setFavMap(togglePresetFav(device.id, index));
  };

  const btn =
    "flex h-7 items-center justify-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-2.5 font-mono text-[10px] uppercase tracking-wider text-[#a89f91] transition-colors hover:border-[#f2a43a]/40 hover:text-[#f0ece4] disabled:opacity-40 disabled:hover:border-white/10 disabled:hover:text-[#a89f91]";

  if (n <= 0) return null;

  return (
    <DialogContent
      className="flex max-h-[86vh] w-[min(560px,92vw)] max-w-[min(560px,92vw)] flex-col gap-0 overflow-hidden rounded-xl border-white/10 bg-[#14100d] p-0 text-[#f0ece4]"
      aria-describedby={undefined}
    >
      {/* header */}
      <div className="border-b border-white/10 pr-10">
        <DialogTitle className="flex items-center gap-2 px-4 py-3 font-mono">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: device.accent }} aria-hidden />
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-bold uppercase tracking-wider" style={{ color: device.accent }}>
              {device.name} — Preset Bank
            </span>
            <span className="block font-mono text-[9px] uppercase tracking-widest text-[#a89f91]">
              {n.toLocaleString()} presets
            </span>
          </span>
        </DialogTitle>
      </div>

      {/* search + favorites */}
      <div className="flex items-center gap-1.5 px-4 pt-3">
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search presets…  (press /)"
          aria-label={`Search ${device.name} presets`}
          className="h-8 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 font-mono text-[11px] text-[#f0ece4] placeholder:text-[#a89f91]/50 focus:border-[#f2a43a]/40 focus:outline-none"
        />
        <button
          onClick={() => setFavsOnly((v) => !v)}
          aria-pressed={favsOnly}
          aria-label={favsOnly ? "Show all presets" : "Show favorite presets only"}
          className={cn(btn, "shrink-0", favsOnly && "border-[#f2a43a]/50 bg-[#f2a43a]/10 text-[#f2a43a]")}
        >
          <Star className={cn("h-3 w-3", favsOnly && "fill-current")} aria-hidden />
          FAVS {favs.length > 0 && `(${favs.length})`}
        </button>
      </div>

      {/* category chips */}
      {cats.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto px-4 pb-1 pt-2" role="group" aria-label="Filter by category">
          {["All", ...cats].map((c) => {
            const active = c === "All" ? cat === null : cat === c;
            return (
              <button
                key={c}
                onClick={() => setCat(c === "All" ? null : c)}
                aria-pressed={active}
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider transition-colors",
                  active
                    ? "border-[#f2a43a]/60 bg-[#f2a43a]/10 text-[#f2a43a]"
                    : "border-white/10 bg-white/[0.02] text-[#a89f91] hover:border-white/25 hover:text-[#f0ece4]"
                )}
              >
                {c}
              </button>
            );
          })}
        </div>
      )}

      {/* transport: prev / next / random / A/B / undo */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 py-2">
        <button
          onClick={() => apply(cur ? (cur.index - 1 + n) % n : n - 1)}
          className={btn}
          aria-label="Previous preset"
        >
          ‹
        </button>
        <button onClick={() => apply(cur ? (cur.index + 1) % n : 0)} className={btn} aria-label="Next preset">
          ›
        </button>
        <button
          onClick={() => apply(randomBankIndex(device, cur?.index))}
          className={btn}
          aria-label="Random preset"
        >
          🎲
        </button>
        <button
          onClick={onAB}
          aria-pressed={abOn}
          aria-label={abOn ? "A/B active — press to swap A and B" : "Store current sound as B, then toggle A/B"}
          className={cn(btn, abOn && "border-[#f2a43a]/50 bg-[#f2a43a]/10 text-[#f2a43a]")}
        >
          A/B
        </button>
        <button onClick={() => skaziStore.presetUndo(device.id)} className={btn} aria-label="Undo last bank preset">
          UNDO
        </button>
        {cur && (
          <span
            className="ml-auto min-w-0 truncate pl-2 font-mono text-[10px] uppercase tracking-wider text-[#a89f91]"
            aria-live="polite"
          >
            <span style={{ color: device.accent }}>{cur.name}</span>
            <span className="text-[#a89f91]/60"> · {fmtIndex(cur.index)}</span>
          </span>
        )}
      </div>

      {/* list */}
      <div
        className="min-h-[160px] flex-1 overflow-y-auto border-t border-white/5 bg-black/20"
        role="listbox"
        aria-label={`${device.name} preset bank list`}
      >
        {results.items.map((p) => {
          const isCur = cur?.index === p.index;
          const isFav = favs.includes(p.index);
          return (
            <div
              key={p.index}
              role="option"
              aria-selected={isCur}
              className={cn(
                "flex items-center border-b border-white/5 transition-colors",
                isCur ? "bg-[#f2a43a]/10" : "hover:bg-white/5"
              )}
            >
              <button
                onClick={() => apply(p.index)}
                className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left"
                aria-label={`Apply preset ${p.name}, ${p.category}`}
              >
                <span className="w-10 shrink-0 font-mono text-[10px] text-[#a89f91]/50">{fmtIndex(p.index)}</span>
                <span
                  className={cn("truncate font-mono text-[11px]", isCur ? "font-bold" : "text-[#f0ece4]")}
                  style={isCur ? { color: device.accent } : undefined}
                >
                  {p.name}
                </span>
                <span className="ml-auto hidden shrink-0 pl-2 font-mono text-[9px] uppercase tracking-wider text-[#a89f91]/60 sm:block">
                  {p.category}
                </span>
              </button>
              <button
                onClick={() => onStar(p.index)}
                aria-label={isFav ? `Remove ${p.name} from favorites` : `Add ${p.name} to favorites`}
                aria-pressed={isFav}
                className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#a89f91]/60 transition-colors hover:bg-white/10 hover:text-[#f2a43a]"
              >
                <Star className={cn("h-3.5 w-3.5", isFav && "fill-current text-[#f2a43a]")} aria-hidden />
              </button>
            </div>
          );
        })}
        {results.items.length === 0 && (
          <div className="px-4 py-8 text-center font-mono text-[10px] uppercase tracking-widest text-[#a89f91]/60">
            no presets match — try clearing the search or category
          </div>
        )}
      </div>

      {/* windowing footer */}
      {results.total > results.items.length && (
        <div className="border-t border-white/5 px-4 py-2 text-center font-mono text-[9px] uppercase tracking-widest text-[#a89f91]/70">
          type to narrow — showing {results.items.length} of {results.total.toLocaleString()}
        </div>
      )}
    </DialogContent>
  );
}

export function PresetBrowser({
  device,
  open,
  onClose,
}: {
  device: SkaziDevice;
  open: boolean;
  onClose: () => void;
}) {
  const n = bankCount(device);
  if (n <= 0) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <PresetBrowserInner key={device.id} device={device} onClose={onClose} />
    </Dialog>
  );
}
