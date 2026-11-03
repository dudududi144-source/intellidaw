/* ------------------------------------------------------------------ */
/*  Deep-scan analysis — rule-based stats computed from the project.   */
/*  These feed both the local quick-scan and the LLM assistant.        */
/* ------------------------------------------------------------------ */

import {
  keyToPitchClasses,
  STEP_COUNT,
  type DrumTrack,
  type Project,
} from "./types";

export interface QuickStat {
  id: string;
  severity: "fix" | "improve" | "ok";
  area: string;
  title: string;
  detail: string;
  fix?: "snap-key" | "humanize" | "balance" | "duck";
}

export interface ProjectStats {
  noteCount: number;
  drumCount: number;
  outOfKey: number;
  flatVel: boolean;
  kickBassClash: number;
  trackCount: number;
  silentTracks: string[];
  loudest: string;
  quietest: string;
  bpm: number;
  key: string;
}

export function computeStats(project: Project): ProjectStats {
  let noteCount = 0;
  let drumCount = 0;
  let outOfKey = 0;
  const vels: number[] = [];
  const scale = keyToPitchClasses(project.songKey);
  for (const t of project.tracks) {
    if (t.kind === "drum") {
      drumCount += t.steps.filter((s) => s.on).length;
    } else {
      noteCount += t.notes.length;
      for (const n of t.notes) {
        vels.push(n.vel);
        const pc = ((n.pitch % 12) + 12) % 12;
        if (!scale.includes(pc)) outOfKey++;
      }
    }
  }
  const kick = project.tracks.find((t): t is DrumTrack => t.kind === "drum" && t.sound === "kick");
  const bass = project.tracks.find((t) => t.kind === "synth" && /bass/i.test(t.name));
  let kickBassClash = 0;
  if (kick && bass && bass.kind === "synth") {
    const kickSteps = new Set(
      kick.steps.map((s, i) => (s.on ? i : -1)).filter((i) => i >= 0)
    );
    for (const n of bass.notes) {
      if (kickSteps.has(n.step) || kickSteps.has((n.step + 15) % STEP_COUNT)) {
        kickBassClash++;
      }
    }
  }
  const loud = [...project.tracks].sort((a, b) => b.volume - a.volume);
  return {
    noteCount,
    drumCount,
    outOfKey,
    flatVel:
      vels.length > 6 &&
      vels.every((v) => Math.abs(v - vels[0]) < 0.03),
    kickBassClash,
    trackCount: project.tracks.length,
    silentTracks: project.tracks
      .filter(
        (t) =>
          (t.kind === "drum" && t.steps.every((s) => !s.on)) ||
          (t.kind === "synth" && t.notes.length === 0)
      )
      .map((t) => t.name),
    loudest: loud[0]?.name ?? "—",
    quietest: loud[loud.length - 1]?.name ?? "—",
    bpm: project.bpm,
    key: project.songKey,
  };
}

export function quickScan(project: Project): QuickStat[] {
  const st = computeStats(project);
  const out: QuickStat[] = [];
  if (st.outOfKey > 0) {
    out.push({
      id: "okey",
      severity: "fix",
      area: "Harmony",
      title: `${st.outOfKey} note${st.outOfKey === 1 ? "" : "s"} out of key`,
      detail: `Found outside A minor. Snap everything back to the scale in one tap.`,
      fix: "snap-key",
    });
  }
  if (st.kickBassClash > 0) {
    out.push({
      id: "duck",
      severity: "fix",
      area: "Low end",
      title: `Bass hits on the kick in ${st.kickBassClash} place${st.kickBassClash === 1 ? "" : "s"}`,
      detail: `Clashes detected between kick and bass. Reduce bass volume slightly and duck its attack.`,
      fix: "duck",
    });
  }
  if (st.flatVel) {
    out.push({
      id: "hum",
      severity: "improve",
      area: "Groove",
      title: "Hats and notes play at the same velocity",
      detail: "Humanise velocity adds subtle variation so the groove breathes.",
      fix: "humanize",
    });
  }
  const spread = Math.max(...project.tracks.map((t) => t.volume)) -
    Math.min(...project.tracks.map((t) => t.volume));
  if (spread > 0.6) {
    out.push({
      id: "bal",
      severity: "improve",
      area: "Mix balance",
      title: `Big level gap between ${st.loudest} and ${st.quietest}`,
      detail: "Balance levels toward a healthier spread across channels.",
      fix: "balance",
    });
  }
  if (st.silentTracks.length) {
    out.push({
      id: "silent",
      severity: "improve",
      area: "Arrangement",
      title: `${st.silentTracks.length} silent track${st.silentTracks.length === 1 ? "" : "s"}`,
      detail: `${st.silentTracks.join(", ")} ha${st.silentTracks.length === 1 ? "s" : "ve"} nothing in the pattern yet.`,
    });
  }
  if (st.noteCount + st.drumCount > 12) {
    out.push({
      id: "good",
      severity: "ok",
      area: "Overview",
      title: `${st.drumCount} drum hits · ${st.noteCount} notes at ${st.bpm} BPM`,
      detail: "Groove looks alive. Keep going — polish and export when ready.",
    });
  } else {
    out.push({
      id: "empty",
      severity: "improve",
      area: "Overview",
      title: "The arrangement is thin",
      detail: "Add drum hits or draw a bassline — templates can fill a whole groove.",
    });
  }
  return out;
}
