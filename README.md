# Intellidaw — Free Online Music Studio & DAW in Your Browser

A complete music studio that runs entirely in the browser, with the **SKAZI Bundle** built right in. No login, no installs, no cloud — your projects stay on your device.

![Intellidaw](public/logo.svg)

## What's inside

**Landing page**

- Hero with animated tour of the studio (beat sequencer → piano roll → mixer → session)
- Interactive instrument browser — every instrument really plays
- Playable 16-pad kit right on the landing page
- SKAZI Bundle showcase — every device deep-links straight into the studio rack
- Deep-scan assistant mock, mixer & session mocks, details grid, FAQ, and more

**The Studio** (click *Start creating free* — no account needed)

- 🥁 **Beat sequencer** — 6 drum tracks × 16 steps, per-step velocity (shift+click), swing
- 🎹 **Piano roll + synths** — 4 synth tracks, waveform picker, filter (cutoff/reso), full ADSR, detune, glide, octave
- 🎛️ **16 pads** — keyboard-mapped (1-0, QWERTY), load your own samples (WAV/MP3) per pad
- 🎚️ **Mixer** — volume, pan, mute/solo, live meters per channel, shared delay & reverb sends, master limiter
- 🤖 **Studio Assistant** — rule-based deep scan + AI insights (LLM backend) with one-tap fixes: snap-to-key, humanize velocity, balance levels, duck the bass
- 💾 **Projects** — saved in browser localStorage (autosave), export/import project files as JSON
- 📤 **Export** — offline-rendered 16-bit / 44.1 kHz stereo WAV mixdown (1–8 bars)
- ⌨️ **Playable everywhere** — computer keyboard (piano keys + pads), space to play/stop, mobile bottom-tab layout

## The SKAZI rack (22 devices)

All **19 free tools** from Asher Swissa's [SKAZI Bundle](https://github.com/slazoasher/skazi-bundle)
([download the real VST3/AU plugins](https://github.com/slazoasher/skazi-bundle/releases/latest)),
recreated from scratch as native Web Audio devices — plus **3 original Intellidaw devices** in the
Extras folder. Every device is playable in the browser, colorable by the master FX rack, and
included in the WAV export.

| Folder | Device | What it does |
| --- | --- | --- |
| **Synths** (4) | SKAZI | Psy / acid VA synth — Virus-style supersaw, analog drift, shaper, arp |
| | BULLY | 3-osc wavetable synth — warp FM, chaos modulation, character FX |
| | KUBE | Dual-warp wavetable synth — FM + AM warp engines |
| | SUBICH | Bass + sub bass synth — glide, drive, three-osc mix |
| **Basslines** (2) | TBON 303 | Classic acid bassline sequencer — 16 steps, accent, slide, octave |
| | SKACID | Special acid bassline sequencer — acid wavetable flavor |
| **Drums & FX** (3) | KICKASS | Kick drum synth — two-stage pitch engine, three-band EQ |
| | BAMBA | Riser & uplift maker — 1–24 bars, snare rolls, gate FX |
| | MIDI GOD | MIDI pattern generator — 10 genres × 9 roles, writes playable patterns to your tracks |
| **FX Rack** (10) | PITA PUMP | BPM-synced sidechain LFO tool |
| | SHAKSUKA | Random chop & glitch FX |
| | THE FILTERFISH | Morphing filter FX |
| | TAHINI | Space delay + reverb |
| | SALAT | Multi-voice chorus / dressing |
| | QUAZI | Phaser |
| | SKILTER | Filter with attitude |
| | SKWIDE | Stereo widener |
| | ZHUG | Spicy distortion / saturator |
| | SKAZI REVERB | Mega reverb — 10 algorithms |
| **Intellidaw Extras** (3) | LIMONANA | 🆕 Iced-mint dream pad — detuned triangle stack, breeze filter LFO, airy shimmer |
| | SABICH | 🆕 Lo-fi crunch keys — crushed wavetable, wobble filter, warm drive |
| | MALABI | 🆕 Creamy boom drum — pitched sine drop with soft-clip cream |

Rack niceties: device **search**, ⭐ **favorites** (persisted), 🎲 **random patch**, per-device
presets, pattern generator + ⚡ MUTATE on the sequencers, and one-click "try it" deep links from
the landing page.

## Tech stack

- **Next.js 16** (App Router) + **TypeScript 5**
- **Tailwind CSS 4** + shadcn/ui components
- **Web Audio API** — custom synthesis engine: drum machine (16 synthesized sounds), subtractive synth voices, SKAZI device voices (procedural wavetables, curves & impulses — all original DSP), lookahead scheduler, shared FX buses (dotted-8th delay + convolution reverb), master FX rack chain, and `OfflineAudioContext` WAV rendering
- **z-ai-web-dev-sdk** (server-side) — powers the AI Studio Assistant at `POST /api/assistant`

## Project layout

```
src/
├── app/                  # landing page + assistant API route
├── components/
│   ├── landing/          # marketing page sections (incl. SKAZI showcase)
│   └── daw/              # the studio: Beats / Keys / Pads / Mixer / SKAZI / Assistant
└── lib/daw/
    ├── engine.ts         # Web Audio engine, transport, offline WAV render
    ├── skazi.ts          # SKAZI device registry, presets, pattern generator, store
    ├── skaziAudio.ts     # per-device Web Audio voices + master FX rack + sequencers
    ├── types.ts          # project / track / template model
    ├── storage.ts        # localStorage projects
    └── analysis.ts       # assistant analysis (key, balance, levels)
```

## Run it

```bash
bun install
bun run dev        # http://localhost:3000
```

The studio works fully client-side; the only server dependency is the optional AI assistant endpoint.

## Credits & attribution

- **Intellidaw** — an original, from-scratch re-creation of the intellidaw.com product experience. No original code or assets are used.
- **SKAZI Bundle** — the 19 bundle devices are functional Web-Audio re-creations inspired by Asher Swissa's free plugins (original code, no third-party binaries or assets). Support the author by grabbing the real plugins: [slazoasher/skazi-bundle](https://github.com/slazoasher/skazi-bundle).
- **Intellidaw Extras** (LIMONANA, SABICH, MALABI) — original devices made for this project.

## Privacy

Everything runs and saves locally in your browser — projects, samples and exports never leave your device.

---

© 2026 Intellidaw · Intelligent Music Studio
