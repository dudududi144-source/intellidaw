"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Project } from "@/lib/daw/types";
import { deleteProject, listProjects, saveProject } from "@/lib/daw/storage";
import { useState } from "react";

interface Entry {
  id: string;
  name: string;
  updatedAt: number;
  project: Project;
}

export function ProjectsDrawer({
  open,
  onOpenChange,
  current,
  onLoad,
  onSaveAsNew,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  current: Project;
  onLoad: (p: Project) => void;
  onSaveAsNew: () => void;
}) {
  const [itemsCache, setItemsCache] = useState<Entry[] | null>(null);
  // always fresh while open; deletion/save overrides via cache
  const items = open ? itemsCache ?? listProjects() : [];

  const handleOpenChange = (v: boolean) => {
    if (!v) setItemsCache(null);
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-white/10 bg-[#171310] text-[#f0ece4] sm:max-w-lg">
        <DialogHeader>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#f2a43a]">
            Your library · on this device
          </div>
          <DialogTitle>Saved projects</DialogTitle>
          <DialogDescription className="text-[#a89f91]">
            No account needed — projects live in your browser&apos;s storage and never
            leave your device.
          </DialogDescription>
        </DialogHeader>
        <div className="studio-scroll max-h-[320px] space-y-2 overflow-y-auto pr-1">
          {items.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-[#a89f91]">
              Nothing saved yet. Hit <span className="text-[#f2a43a]">Save</span> in the
              top bar and it will show up here.
            </div>
          )}
          {items.map((it) => (
            <div
              key={it.id}
              className="flex items-center gap-3 rounded-xl border border-white/5 bg-[#14100d] px-3.5 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-[#f0ece4]">
                  {it.name}
                  {it.id === current.id && (
                    <span className="ml-2 rounded bg-[#f2a43a]/15 px-1.5 py-0.5 font-mono text-[9px] uppercase text-[#f2a43a]">
                      current
                    </span>
                  )}
                </div>
                <div className="font-mono text-[10px] text-[#a89f91]">
                  {new Date(it.updatedAt).toLocaleString()} · {it.project.tracks.length} tracks ·{" "}
                  {it.project.bpm} BPM
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  onLoad(it.project);
                  onOpenChange(false);
                }}
                className="bg-[#f2a43a] font-bold text-[#17120a] hover:bg-[#ffb75c]"
              >
                Open
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setItemsCache(deleteProject(it.id))}
                className="px-2 text-[#e5533d] hover:bg-[#e5533d]/10 hover:text-[#ff9a8a]"
                aria-label={`Delete ${it.name}`}
              >
                ✕
              </Button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              onSaveAsNew();
              setItemsCache(listProjects());
            }}
            variant="outline"
            className="flex-1 border-white/10 bg-transparent text-[#f0ece4] hover:bg-white/5"
          >
            Save current as copy
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { saveProject };
