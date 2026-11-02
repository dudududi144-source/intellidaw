# Intellidaw — Free Online Music Studio & DAW in Your Browser

A full clone of the Intellidaw product: a complete music studio that runs entirely in the browser. No login, no installs, no cloud — your projects stay on your device.

![Intellidaw](public/logo.svg)

## What's inside

**Landing page** (faithful clone of intellidaw.com)

- Hero with animated tour of the studio (beat sequencer → piano roll → mixer → session)
- Interactive instrument browser — every instrument really plays
- Playable 16-pad kit right on the landing page
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

## Tech stack

- **Next.js 16** (App Router) + **TypeScript 5**
- **Tailwind CSS 4** + shadcn/ui components
- **Web Audio API** — custom synthesis engine: drum machine (16 synthesized sounds), subtractive synth voices, lookahead scheduler, shared FX buses (dotted-8th delay + convolution reverb), and `OfflineAudioContext` WAV rendering
- **z-ai-web-dev-sdk** (server-side) — powers the AI Studio Assistant at `POST /api/assistant`

## Run it

```bash
bun install
bun run dev        # http://localhost:3000
```

The studio works fully client-side; the only server dependency is the optional AI assistant endpoint.

## Privacy

Everything runs and saves locally in your browser — projects, samples and exports never leave your device.

---

© 2026 Intellidaw · Intelligent Music Studio
