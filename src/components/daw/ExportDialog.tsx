"use client";

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Project } from "@/lib/daw/types";
import { getEngine } from "@/lib/daw/engine";
import { downloadBlob, downloadJson, sanitizeProject } from "@/lib/daw/storage";

export function ExportDialog({
  open,
  onOpenChange,
  project,
  onLoadProject,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: Project;
  onLoadProject: (p: Project) => void;
}) {
  const [bars, setBars] = useState(4);
  const [rendering, setRendering] = useState(false);
  const [done, setDone] = useState(false);
  const [importErr, setImportErr] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const render = async () => {
    setRendering(true);
    setDone(false);
    try {
      const blob = await getEngine().renderWav(project, bars);
      downloadBlob(blob, `${project.name.replace(/[^\w\- ]+/g, "")}-${bars}bar.wav`);
      setDone(true);
    } catch (e) {
      console.error(e);
    } finally {
      setRendering(false);
    }
  };

  const loadFile = async (file: File) => {
    try {
      const text = await file.text();
      const p = sanitizeProject(JSON.parse(text));
      if (p) {
        setImportErr(false);
        onLoadProject(p);
        onOpenChange(false);
      } else {
        setImportErr(true);
      }
    } catch {
      setImportErr(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-[#171310] text-[#f0ece4] sm:max-w-md">
        <DialogHeader>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#f2a43a]">
            Export · 24-bit · 44.1 kHz
          </div>
          <DialogTitle>Export anything</DialogTitle>
          <DialogDescription className="text-[#a89f91]">
            Render a WAV mixdown of your loop, or back the project up as a file. Stays
            on your device — nothing is uploaded.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div>
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-[#a89f91]">
              Length
            </div>
            <div className="flex gap-2">
              {[1, 2, 4, 8].map((b) => (
                <button
                  key={b}
                  onClick={() => setBars(b)}
                  className={`flex-1 rounded-lg py-2 font-mono text-xs ${
                    bars === b
                      ? "bg-[#f2a43a] font-bold text-[#17120a]"
                      : "bg-white/5 text-[#a89f91] hover:text-[#f0ece4]"
                  }`}
                >
                  {b} bar{b > 1 ? "s" : ""}
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={render}
            disabled={rendering}
            className="w-full bg-[#f2a43a] py-6 text-sm font-bold text-[#17120a] hover:bg-[#ffb75c]"
          >
            {rendering ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#17120a]/30 border-t-[#17120a]" />
                Rendering {bars} bar{bars > 1 ? "s" : ""}…
              </span>
            ) : (
              "⬇ Render WAV"
            )}
          </Button>
          {done && (
            <div className="rounded-lg border border-[#8fbf6b]/30 bg-[#8fbf6b]/10 px-3 py-2 text-center font-mono text-[11px] text-[#b5e294]">
              ✓ WAV saved to your downloads
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => downloadJson(project)}
              className="border-white/10 bg-transparent text-[#f0ece4] hover:bg-white/5"
            >
              Project file
            </Button>
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              className="border-white/10 bg-transparent text-[#f0ece4] hover:bg-white/5"
            >
              Load project
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadFile(f);
              e.target.value = "";
            }}
          />
          {importErr && (
            <div className="rounded-lg border border-[#e5533d]/30 bg-[#e5533d]/10 px-3 py-2 text-center font-mono text-[11px] text-[#ff9a8a]">
              That file is not a valid Intellidaw project.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
