/* ------------------------------------------------------------------ */
/*  /api/plugins/import — real plugin-file intake for the studio.      */
/*  POST: multipart form "file" (.vst3/.clap/.dll binary). The PE       */
/*  image is parsed server-side (machine type, export table, embedded   */
/*  strings) and the facts are reported honestly — including the case   */
/*  where the file is only a wrapper shell (e.g. the user's FM-1.vst3:  */
/*  a CLAP→VST3 wrapper whose DSP lives in a companion .clap).          */
/*  GET: index of imported files (metadata).                            */
/*  GET ?sha=<hash>&download=1: stream the original bytes back.         */
/*  Native Windows/macOS binaries cannot execute in a browser — when a  */
/*  known engine matches (FM-1 → the native 4-op algorithm FM), the     */
/*  response maps the import to it; otherwise the file is stored as     */
/*  provenance only. No fake claims.                                    */
/* ------------------------------------------------------------------ */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIR = path.join(process.cwd(), "db", "plugins");
const INDEX = path.join(DIR, "index.json");
const MAX_SIZE = 64 * 1024 * 1024; // 64MB
const MAX_ENTRIES = 50;

/* ---------------- PE parsing (evidence, not guesswork) ---------------- */

interface PeFacts {
  isPe: boolean;
  machine: string | null; // "x64" | "x86" | "ARM64" | …
  pePlus: boolean;
  sections: number;
  exportName: string | null; // first export (VST3 modules export GetPluginFactory)
  wrapper: string | null; // "CLAP→VST3 wrapper" when detected
  vendor: string | null;
  format: string;
}

function cstr(buf: Buffer, off: number, max = 96): string {
  let end = off;
  const limit = Math.min(buf.length, off + max);
  while (end < limit && buf[end] !== 0) end++;
  return buf.toString("latin1", off, end);
}

function parsePe(buf: Buffer, fileName: string): PeFacts {
  const facts: PeFacts = {
    isPe: false,
    machine: null,
    pePlus: false,
    sections: 0,
    exportName: null,
    wrapper: null,
    vendor: null,
    format: path.extname(fileName).replace(".", "").toUpperCase() || "BIN",
  };
  if (buf.length < 0x40 || buf.toString("latin1", 0, 2) !== "MZ") return facts;
  const peOff = buf.readUInt32LE(0x3c);
  if (peOff <= 0 || peOff + 6 > buf.length || buf.toString("latin1", peOff, peOff + 4) !== "PE\0\0") return facts;
  facts.isPe = true;
  const machine = buf.readUInt16LE(peOff + 4);
  facts.machine =
    machine === 0x8664 ? "x64 (AMD64)" :
    machine === 0x014c ? "x86" :
    machine === 0xaa64 ? "ARM64" :
    machine === 0x01c4 ? "ARM Thumb-2" : `0x${machine.toString(16)}`;
  const numSections = buf.readUInt16LE(peOff + 6);
  const optSize = buf.readUInt16LE(peOff + 20);
  facts.sections = numSections;
  const optOff = peOff + 24;
  if (optSize >= 112 && optOff + 2 <= buf.length) {
    const magic = buf.readUInt16LE(optOff);
    facts.pePlus = magic === 0x20b;
    // data directories: export table = index 0
    const ddOff = optOff + (facts.pePlus ? 112 : 96);
    if (ddOff + 8 <= buf.length) {
      const expRva = buf.readUInt32LE(ddOff);
      const expSize = buf.readUInt32LE(ddOff + 4);
      if (expRva > 0 && expSize > 0) {
        // map RVA → file offset via section table
        const secTab = optOff + optSize;
        const tryOff = (rva: number): number | null => {
          for (let s2 = 0; s2 < numSections; s2++) {
            const sh2 = secTab + s2 * 40;
            if (sh2 + 40 > buf.length) break;
            const va = buf.readUInt32LE(sh2 + 12);
            const vs = buf.readUInt32LE(sh2 + 8);
            const rp = buf.readUInt32LE(sh2 + 20);
            if (rva >= va && rva < va + Math.max(vs, 1)) return rp + (rva - va);
          }
          return null;
        };
        for (let s = 0; s < numSections; s++) {
          const sh = secTab + s * 40;
          if (sh + 40 > buf.length) break;
          const vAddr = buf.readUInt32LE(sh + 12);
          const vSize = buf.readUInt32LE(sh + 8);
          const rawPtr = buf.readUInt32LE(sh + 20);
          if (expRva >= vAddr && expRva < vAddr + Math.max(vSize, 1)) {
            const expOff = rawPtr + (expRva - vAddr);
            if (expOff + 40 <= buf.length) {
              const nameRva = buf.readUInt32LE(expOff + 12); // Name RVA of the DLL export
              const namePtrTblRva = buf.readUInt32LE(expOff + 32);
              let name: string | null = null;
              const no = tryOff(nameRva);
              if (no !== null) name = cstr(buf, no);
              if (!name) {
                const pOff = tryOff(namePtrTblRva);
                if (pOff !== null) {
                  const firstRva = buf.readUInt32LE(pOff);
                  const fo = tryOff(firstRva);
                  if (fo !== null) name = cstr(buf, fo);
                }
              }
              facts.exportName = name;
            }
            break;
          }
        }
      }
    }
  }
  return facts;
}

/* string probes — wrapper/vendor markers we can honestly detect */
const MARKERS: Array<{ re: RegExp; tag: string }> = [
  { re: /CLAP-As-VST3-Wrapper|clap\.audio|free-audio\/clap-wrapper/i, tag: "CLAP→VST3 wrapper (free-audio clap-wrapper)" },
  { re: /juce/i, tag: "JUCE-built plugin" },
  { re: /Steinberg VST/i, tag: "VST3 (Steinberg SDK)" },
  { re: /iZotope|Arturia|Native Instruments|u-he|XLN Audio|Air Music/i, tag: "commercial vendor binary" },
];

function scanStrings(buf: Buffer, facts: PeFacts): { hits: string[]; vendor: string | null } {
  const ascii = buf.toString("latin1");
  const utf16 = buf.toString("utf16le");
  const haystack = `${ascii}\n${utf16}`;
  const hits: string[] = [];
  let vendor: string | null = null;
  for (const m of MARKERS) {
    if (m.re.test(haystack)) hits.push(m.tag);
  }
  if (/The CLAP Wrapper Team/.test(haystack)) {
    facts.wrapper = "CLAP→VST3 wrapper shell";
    vendor = "The CLAP Wrapper Team";
  }
  const vendorMatch = haystack.match(/(?:^|[\r\n])([A-Z][A-Za-z0-9 &.]{2,40}(?:Audio|Sound|Instruments|Music|Team|Systems))[\r\n]/);
  if (!vendor && vendorMatch) vendor = vendorMatch[1];
  return { hits, vendor };
}

/* engine mapping — which native engine can host this import */
function engineFor(fileName: string, ascii: string): { engine: string | null; note: string } {
  const hay = `${fileName} ${ascii.slice(0, 2_000_000)}`;
  if (/FM[\s_-]?1/i.test(hay) && !/FM[\s_-]?1[0-9]/i.test(hay)) {
    return {
      engine: "fm1",
      note: "Maps to the native FM-1 engine (4-op algorithm FM browser build of the M-VAVE FM-1).",
    };
  }
  return { engine: null, note: "No native engine maps to this file yet — stored as provenance only." };
}

/* ---------------- index helpers ---------------- */

interface ImportEntry {
  sha256: string;
  fileName: string;
  size: number;
  format: string;
  machine: string | null;
  pePlus: boolean;
  sections: number;
  isPe: boolean;
  exportName: string | null;
  wrapper: string | null;
  vendor: string | null;
  markers: string[];
  engine: string | null;
  engineNote: string;
  dspEmbedded: string;
  importedAt: string;
}

async function readIndex(): Promise<ImportEntry[]> {
  try {
    const raw = await readFile(INDEX, "utf8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function writeIndex(entries: ImportEntry[]): Promise<void> {
  await mkdir(DIR, { recursive: true });
  await writeFile(INDEX, JSON.stringify(entries.slice(0, MAX_ENTRIES), null, 1));
}

/* ---------------- routes ---------------- */

export async function GET(req: NextRequest) {
  const sha = req.nextUrl.searchParams.get("sha");
  if (sha) {
    const entries = await readIndex();
    const hit = entries.find((e) => e.sha256 === sha);
    if (!hit) return NextResponse.json({ error: "not found" }, { status: 404 });
    const file = path.join(DIR, `${sha}.bin`);
    try {
      const buf = await readFile(file);
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${hit.fileName.replace(/[^\w.\- ]+/g, "_")}"`,
          "Content-Length": String(buf.length),
        },
      });
    } catch {
      return NextResponse.json({ error: "file missing" }, { status: 410 });
    }
  }
  const entries = await readIndex();
  return NextResponse.json({ entries });
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart/form-data with a 'file' field" }, { status: 400 });
  }
  const f = form.get("file");
  if (!(f instanceof File)) {
    return NextResponse.json({ error: "missing 'file' field" }, { status: 400 });
  }
  if (f.size === 0) return NextResponse.json({ error: "empty file" }, { status: 400 });
  if (f.size > MAX_SIZE) return NextResponse.json({ error: "file too large (max 64MB)" }, { status: 413 });

  const fileName = f.name || "plugin.bin";
  const buf = Buffer.from(await f.arrayBuffer());
  const sha256 = createHash("sha256").update(buf).digest("hex");

  const facts = parsePe(buf, fileName);
  const { hits, vendor } = scanStrings(buf, facts);
  const ascii = buf.toString("latin1");
  const { engine, note } = engineFor(fileName, ascii);

  /* honest DSP statement — a wrapper shell contains no synth code */
  const dspEmbedded = facts.wrapper
    ? "NOT embedded — this file is a wrapper that loads a companion .clap/.vst3 binary at runtime on a native OS. Browsers cannot execute it."
    : facts.isPe
      ? "Native binary — browsers cannot execute it. Stored & analyzed; a matching native engine may be offered."
      : "Unrecognized container — stored as provenance only.";

  const entry: ImportEntry = {
    sha256,
    fileName,
    size: f.size,
    format: facts.format,
    machine: facts.machine,
    pePlus: facts.pePlus,
    sections: facts.sections,
    isPe: facts.isPe,
    exportName: facts.exportName,
    wrapper: facts.wrapper ?? (hits[0] ?? null),
    vendor: facts.vendor ?? vendor,
    markers: hits,
    engine,
    engineNote: note,
    dspEmbedded,
    importedAt: new Date().toISOString(),
  };

  const entries = (await readIndex()).filter((e) => e.sha256 !== sha256);
  entries.unshift(entry);
  await mkdir(DIR, { recursive: true });
  await writeFile(path.join(DIR, `${sha256}.bin`), buf);
  await writeIndex(entries);

  return NextResponse.json({ ok: true, entry });
}
