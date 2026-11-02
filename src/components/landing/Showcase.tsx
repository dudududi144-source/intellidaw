"use client";

import { Activity, Keyboard, Mic2, Radio, Route, Timer, Waves } from "lucide-react";
import { Bullet, Card, Chip, EqBars, Section, SectionHead } from "./kit";
import { cn } from "@/lib/utils";

/* ---------------- assistant ---------------- */

const ASSISTANT_CHIPS = [
  ["Notes out of key", "Counted per track, snapped in one tap"],
  ["Kick vs bass", "Clashes found, sidechain set up for you"],
  ["Groove & feel", "Flat velocities, straight hats, swing"],
  ["Mix balance", "Mud, crowded octaves, dry mixes"],
];

function AssistantMock() {
  return (
    <Card className="relative overflow-hidden bg-gradient-to-b from-[#17120e] to-[#100d0b]">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f2a43a]/10 font-mono text-lg font-bold text-[#f2a43a] ring-1 ring-[#f2a43a]/25">
            81
          </span>
          <div>
            <div className="text-[15px] font-semibold text-[#f0ece4]">Deep scan</div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#a89f91]">
              3 insights for “Midnight Drive”
            </div>
          </div>
        </div>
        <div className="hidden font-mono text-[9px] uppercase tracking-wider text-[#a89f91] sm:block">
          Harmony · Groove · Low end · Mix
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {[
          ["FIX", "fix", "Bass hits on the kick in 6 places", "Set up kick sidechain"],
          ["IMPROVE", "improve", "The harmony never moves", "Suggest a progression in A minor"],
          ["IMPROVE", "improve", "Hats play every note at the same velocity", "Humanise velocity"],
        ].map(([label, sev, title, action]) => (
          <div key={title} className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-black/25 p-3.5">
            <span
              className={cn(
                "rounded px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wide",
                sev === "fix" ? "bg-[#e5533d] text-white" : "bg-[#f2a43a] text-[#17120a]"
              )}
            >
              {label}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-medium text-[#f0ece4]">{title}</div>
              <div className="truncate text-[12px] text-[#a89f91]">{action}</div>
            </div>
            <span className="rounded-lg border border-[#f2a43a]/40 px-2.5 py-1 font-mono text-[9px] font-bold tracking-wider text-[#f2a43a]">
              FIX
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function Assistant() {
  return (
    <Section id="assistant">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div>
          <SectionHead
            kicker="Studio assistant"
            title="A second pair of ears that reads your whole song"
            sub="Deep scan checks harmony, groove, low end and mix balance, then explains what it found in plain words. Most tips come with a one-tap fix you can undo."
          />
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {ASSISTANT_CHIPS.map(([t, d]) => (
              <div key={t} className="rounded-xl border border-white/[0.06] bg-[#14100d] p-3.5">
                <div className="flex items-center gap-2 text-[13.5px] font-semibold text-[#f0ece4]">
                  <Activity className="h-4 w-4 text-[#f2a43a]" aria-hidden />
                  {t}
                </div>
                <div className="pl-6 text-[12.5px] text-[#a89f91]">{d}</div>
              </div>
            ))}
          </div>
        </div>
        <AssistantMock />
      </div>
    </Section>
  );
}

/* ---------------- mixing ---------------- */

const CHANNELS: Array<[string, string, string, string, number, string]> = [
  ["Drums", "DRUM BUS", "EQ · Glue", "#f2a43a", 78, "0 dB"],
  ["Bass", "SA-2", "Duck · Drive", "#e5c15a", 88, "-2.1 dB"],
  ["Keys", "SX-1", "EQ · Chorus", "#d97b5a", 62, "-4.1 dB"],
  ["Lead", "WX-4", "Delay · Reverb", "#8fbf6b", 70, "-2.9 dB"],
  ["Pad", "WX-4", "Comb · Reverb", "#b8a98f", 48, "-6.1 dB"],
  ["FX Return", "SEND", "Reverb", "#c9b458", 40, "-7.4 dB"],
];

function MixerMock() {
  return (
    <Card className="bg-gradient-to-b from-[#17120e] to-[#100d0b]">
      <div className="mb-4 flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#a89f91]">
          Mixer · 6 channels · 2 groups
        </div>
        <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-[#8fbf6b]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#8fbf6b] pulse-dot" /> Playing · bar 17
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-7">
        {CHANNELS.map(([name, sub, fx, color, lvl, db]) => (
          <div key={name} className="rounded-lg border border-white/[0.05] bg-black/25 p-2">
            <div className="truncate text-center text-[10px] font-semibold text-[#f0ece4]">{name}</div>
            <div className="truncate text-center font-mono text-[7.5px] uppercase tracking-wider text-[#a89f91]">{sub}</div>
            <div className="mt-1.5 truncate text-center font-mono text-[7.5px] text-[#f2a43a]/80">{fx}</div>
            <div className="mx-auto mt-2 h-20 w-3.5 overflow-hidden rounded-full bg-black/60 sm:h-24">
              <div
                className="w-full rounded-full"
                style={{ height: `${lvl}%`, marginTop: `${100 - lvl}%`, background: `linear-gradient(to top, ${color}, ${color}66)` }}
              />
            </div>
            <div className="mt-1 text-center font-mono text-[8px] text-[#a89f91]">{db}</div>
          </div>
        ))}
        <div className="rounded-lg border border-[#f2a43a]/35 bg-[#f2a43a]/[0.06] p-2">
          <div className="text-center text-[10px] font-bold text-[#f2a43a]">MASTER</div>
          <div className="text-center font-mono text-[7.5px] uppercase tracking-wider text-[#a89f91]">Main out</div>
          <div className="mx-auto mt-3 h-20 w-3.5 overflow-hidden rounded-full bg-black/60 sm:h-24">
            <div className="mt-[18%] w-full rounded-full bg-gradient-to-t from-[#c97f1e] to-[#ffe9c2]" style={{ height: "82%" }} />
          </div>
          <div className="mt-1 text-center font-mono text-[8px] text-[#f2a43a]">−14.4 LUFS</div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-1.5 overflow-hidden rounded-lg border border-white/[0.05] bg-black/25 px-3 py-2 font-mono text-[9px] uppercase tracking-wider text-[#a89f91]">
        <span className="text-[#8fbf6b]">IN</span>
        {["EQ 3-band", "Comp 4:1", "Chorus", "Delay 1/8", "Reverb 2.4s", "Limiter −1 dB"].map((u) => (
          <span key={u} className="whitespace-nowrap rounded bg-white/[0.05] px-1.5 py-0.5">{u}</span>
        ))}
        <span className="text-[#8fbf6b]">OUT</span>
      </div>
    </Card>
  );
}

export function Mixing() {
  return (
    <Section id="mixing">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div className="order-2 lg:order-1">
          <SectionHead
            kicker="Mix & master"
            title="A real mixer, effects that chain, and a master that hits loud"
            sub="Every channel gets EQ, dynamics, sends and a chain of insert effects. Group tracks into buses, draw automation, duck the bass to the kick and check loudness in LUFS."
          />
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <Bullet icon={Route} title="Group buses" text="Route drums and vocals together, then mix groups." />
            <Bullet icon={Waves} title="Sends" text="Shared delay and reverb returns with per-channel sends." />
            <Bullet icon={Timer} title="Automation" text="Draw filter sweeps and level rides across bars." />
          </div>
        </div>
        <div className="order-1 lg:order-2">
          <MixerMock />
        </div>
      </div>
    </Section>
  );
}

/* ---------------- perform ---------------- */

const SCENES: Array<[string, Array<[string, string, string]>]> = [
  ["Intro", [["Intro Beat", "#f2a43a", "queued"], ["Sub Pulse", "#e5c15a", "queued"]]],
  ["Verse", [["Groove", "#f2a43a", "ready"], ["Walk", "#e5c15a", "ready"], ["Chords", "#8fbf6b", "ready"]]],
  ["Build", [["Build Roll", "#d97b5a", "ready"], ["Rise", "#e5c15a", "ready"], ["Arp", "#8fbf6b", "ready"]]],
  ["Drop", [["Drop Beat", "#f2a43a", "playing"], ["Drop Bass", "#8fbf6b", "playing"], ["Stabs", "#e5c15a", "playing"], ["Hook", "#f2a43a", "playing"]]],
];

function SessionMock() {
  return (
    <Card className="bg-gradient-to-b from-[#17120e] to-[#100d0b]">
      <div className="mb-4 flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#a89f91]">
          Session · Midnight Drive
        </div>
        <span className="rounded-full bg-[#8fbf6b]/15 px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-[#8fbf6b]">
          ◍ Live FX
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {SCENES.map(([scene, clips], si) => (
          <div key={scene}>
            <div className="mb-1.5 flex items-center gap-1">
              <span className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[8px] font-bold text-[#f2a43a]">
                {si + 1}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-wider text-[#a89f91]">{scene}</span>
            </div>
            <div className="space-y-1.5">
              {clips.map(([label, color, state]) => (
                <div
                  key={label}
                  className={cn(
                    "flex h-9 items-center justify-between rounded-md px-2 ring-1 sm:h-11",
                    state === "playing" ? "ring-[#8fbf6b]/60" : state === "queued" ? "ring-[#f2a43a]/50" : "ring-white/[0.06]"
                  )}
                  style={{ background: `linear-gradient(to right, ${color}30, ${color}0d)` }}
                >
                  <span className="truncate text-[9.5px] font-medium text-[#f0ece4] sm:text-[11px]">{label}</span>
                  {state === "playing" ? (
                    <EqBars count={3} className="h-2.5" />
                  ) : (
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        state === "queued" ? "bg-[#f2a43a]" : "bg-white/20"
                      )}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/[0.05] bg-black/25 px-3 py-2">
        <span className="font-mono text-[9px] uppercase tracking-wider text-[#a89f91]">Live FX</span>
        {["Filter", "Crush", "Comb", "Tape", "Echo"].map((f, i) => (
          <span
            key={f}
            className={cn(
              "rounded px-2 py-0.5 font-mono text-[9px] uppercase",
              i === 0 ? "bg-[#f2a43a] text-[#17120a]" : "bg-white/[0.05] text-[#a89f91]"
            )}
          >
            {f}
          </span>
        ))}
      </div>
    </Card>
  );
}

export function Perform() {
  return (
    <Section id="perform">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div>
          <SectionHead
            kicker="Perform live"
            title="Launch clips, play keys, throw effects"
            sub="Flip to the Session grid to jam with clips and scenes, scenes on keys 1–9. Play the on-screen keyboard or plug in a MIDI controller, and ride Live FX over the whole mix."
          />
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <Bullet icon={Radio} title="Session clips & scenes" text="Scenes fire on keys 1–9, clips queue with count-in." />
            <Bullet icon={Keyboard} title="MIDI controllers" text="Notes, velocity, pitch bend and the mod wheel work." />
            <Bullet icon={Mic2} title="Mic recording & tuner" text="Record takes and tune up before you play." />
            <Bullet icon={Waves} title="Live FX strip" text="Filter, crush, comb, tape and echo over the whole mix." />
          </div>
        </div>
        <SessionMock />
      </div>
    </Section>
  );
}
