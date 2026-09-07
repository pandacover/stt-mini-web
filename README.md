# stt-mini

Local-first in-browser dictation testbed.

Hold Space (or the pad), talk, release. A quantized Whisper model runs in a Web Worker via Transformers.js. Audio is captured in the tab, resampled to 16 kHz, transcribed on-device, then discarded. The only network use is the first-time download of model weights from Hugging Face, which the browser then caches.

This is a web stand-in for a native Mac/iPhone app: same product loop, much less packaging work.

## What it tests

- Push-to-talk instead of a 30-second silence cutoff
- Raw vs cleaned transcript (filler strip, light punctuation, number words)
- A local glossary for product names and jargon
- Device routing: WebGPU when the browser exposes it, WASM otherwise
- Perceived latency (audio seconds vs ASR milliseconds)

## Run

```bash
npm install
npm run dev
```

Open the printed localhost URL. Chrome or Edge is the most reliable path for WebGPU. Safari will fall back to WASM and feel slower.

First load downloads `Xenova/whisper-tiny.en` (~40 MB). After that it should start from cache.

## Deploy on Vercel

Yes. This is a static Vite app. Vercel only hosts the page and JS. Whisper still runs in the visitor's browser.

1. Import [pandacover/stt-mini-web](https://github.com/pandacover/stt-mini-web) in Vercel.
2. Leave the defaults: Framework **Vite**, build `npm run build`, output `dist`.
3. Deploy. Mic access needs HTTPS, which Vercel already gives you.

Or from the repo:

```bash
npm i -g vercel
vercel
```

What Vercel does *not* do:

- It does not transcribe audio on a server.
- It does not ship the 40–75 MB model inside the deployment. The first visit still fetches weights from Hugging Face and caches them in the browser.
- WebGPU is still Chrome/Edge-only. Safari falls back to WASM.

Do not turn on Cross-Origin Isolation (`COOP`/`COEP`) on the Vercel project unless you also vendor ONNX WASM with the right `Cross-Origin-Resource-Policy` headers. The current build does not need it.

## Models

| Id | Why it is there |
| --- | --- |
| `tiny.en` | Default. Fast enough to judge the UX. |
| `tiny` | Same size, multilingual. |
| `base.en` | Better on names. Still reasonable in a tab. |

Do not expect native Parakeet-on-ANE quality here. The point of this repo is to iterate on capture, cleanup, and glossary before paying for a Swift app.

## Privacy posture

- Microphone audio never leaves the machine
- Transcripts live in memory / `localStorage` glossary only
- No account, no telemetry
- Model files are third-party weights from Hugging Face

## Repo note

`github.com/pandacover/stt-mini` was requested as the canonical repo. The connected GitHub app could not read or write that name (API 404 while create reported the name as taken), so this public sibling exists as `stt-mini-web`. Grant the GitHub app access to `stt-mini` if you want the same tree pushed there.
