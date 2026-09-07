import "./style.css";
import { closeMic, openMic, peakLevel, type MicSession } from "./lib/audio";
import { prepareCapture } from "./lib/audio-prep";
import { cleanTranscript } from "./lib/cleanup";
import { loadGlossary, saveGlossary } from "./lib/glossary";
import {
  MODEL_NOTES,
  type AppStatus,
  type GlossaryEntry,
  type ModelId,
  type SessionRow,
  type WorkerOut,
} from "./lib/types";

function loadModel(): ModelId {
  const stored = localStorage.getItem("stt-mini.model.v2") as ModelId | null;
  if (stored === "tiny.en" || stored === "tiny" || stored === "base.en" || stored === "small.en") {
    return stored;
  }
  return "small.en";
}

function requireEl<T extends HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing ${selector}`);
  return el;
}

const app = requireEl<HTMLDivElement>("#app");
const coarse = window.matchMedia("(pointer: coarse)").matches;

const state = {
  status: "booting" as AppStatus,
  model: loadModel(),
  device: "—",
  progress: 0,
  progressLabel: "Starting worker",
  raw: "",
  clean: "",
  error: "",
  lastMs: 0,
  lastSeconds: 0,
  glossary: loadGlossary(),
  history: [] as SessionRow[],
  tab: "clean" as "clean" | "raw",
};

let mic: MicSession | null = null;
let meterTimer = 0;

const worker = new Worker(new URL("./lib/whisper-worker.ts", import.meta.url), {
  type: "module",
});

worker.onmessage = (event: MessageEvent<WorkerOut>) => {
  const msg = event.data;
  if (msg.type === "progress") {
    state.status = "loading-model";
    state.progress = msg.progress;
    state.progressLabel = `${msg.status}${msg.file ? ` · ${fileName(msg.file)}` : ""}`;
    render();
  }
  if (msg.type === "ready") {
    state.status = "ready";
    state.device = msg.device;
    state.progress = 100;
    state.progressLabel = `Ready on ${msg.device}`;
    state.error = "";
    render();
  }
  if (msg.type === "result") {
    state.raw = msg.text;
    state.clean = cleanTranscript(msg.text, state.glossary);
    state.lastMs = msg.ms;
    state.status = "ready";
    state.history.unshift({
      id: crypto.randomUUID(),
      at: Date.now(),
      raw: state.raw,
      clean: state.clean,
      ms: msg.ms,
      seconds: state.lastSeconds,
    });
    render();
  }
  if (msg.type === "error") {
    state.status = "error";
    state.error = msg.message;
    render();
  }
};

worker.onerror = (err) => {
  state.status = "error";
  state.error = err.message || "Worker failed to start.";
  render();
};

function fileName(path: string) {
  return path.split("/").pop() ?? path;
}

function canRecord() {
  return state.status === "ready" || state.status === "listening" || state.status === "error";
}

function micLabel() {
  if (state.status === "listening") return coarse ? "Tap to stop" : "Release";
  if (state.status === "transcribing") return "Wait";
  return coarse ? "Tap to talk" : "Hold";
}

function paintMic() {
  document.querySelectorAll<HTMLButtonElement>(".mic").forEach((btn) => {
    btn.classList.toggle("listening", state.status === "listening");
    btn.disabled = !canRecord() || state.status === "transcribing";
    btn.textContent = micLabel();
  });
  document.querySelectorAll(".status").forEach((el) => {
    el.textContent = statusLine();
  });
  document.querySelectorAll(".error").forEach((el) => {
    el.textContent = state.error;
  });
}

async function startListen() {
  if (state.status === "listening" || mic) return;
  if (state.status === "transcribing" || state.status === "loading-model" || state.status === "booting") return;
  state.error = "";
  try {
    mic = await openMic();
    state.status = "listening";
    paintMic();
    meterTimer = window.setInterval(() => {
      if (!mic) return;
      const level = peakLevel(mic.chunks);
      document.querySelectorAll<HTMLButtonElement>(".mic").forEach((btn) => {
        btn.style.setProperty("--level", String(0.7 + Math.min(level, 1) * 0.45));
      });
    }, 80);
  } catch (err) {
    state.status = "error";
    state.error = err instanceof Error ? err.message : "Microphone permission denied.";
    render();
  }
}

function stopListen() {
  if (!mic) return;
  const captured = closeMic(mic);
  mic = null;
  window.clearInterval(meterTimer);
  state.lastSeconds = captured.seconds;
  document.querySelectorAll<HTMLButtonElement>(".mic").forEach((btn) => {
    btn.style.setProperty("--level", "0.72");
  });
  const prepared = prepareCapture(captured.audio, captured.sampleRate);
  if (!prepared.ok) {
    state.status = "ready";
    state.error =
      prepared.reason === "too-quiet"
        ? "Not enough speech. Talk closer to the mic at a normal volume."
        : "Clip was too short. Talk a little longer.";
    paintMic();
    return;
  }
  state.lastSeconds = prepared.seconds;
  state.status = "transcribing";
  state.progressLabel = "Transcribing on-device…";
  paintMic();
  const samples = new Float32Array(prepared.audio);
  worker.postMessage({
    type: "transcribe",
    audio: samples,
    sampleRate: prepared.sampleRate,
  });
}

function setModel(model: ModelId) {
  state.model = model;
  localStorage.setItem("stt-mini.model.v2", model);
  state.status = "loading-model";
  state.progress = 0;
  state.progressLabel = "Loading model";
  render();
  worker.postMessage({ type: "load", model });
}

function updateGlossary(next: GlossaryEntry[]) {
  state.glossary = next;
  saveGlossary(next);
  if (state.raw) state.clean = cleanTranscript(state.raw, state.glossary);
  render();
}

function copy(text: string) {
  void navigator.clipboard.writeText(text);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&")
    .replaceAll("<", "<")
    .replaceAll(">", ">");
}

function bindMic(btn: HTMLButtonElement) {
  btn.addEventListener("pointerdown", (e) => {
    if (btn.disabled) return;
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    if (coarse) {
      if (state.status === "listening") stopListen();
      else void startListen();
      return;
    }
    void startListen();
  });
  btn.addEventListener("pointerup", () => {
    if (!coarse) stopListen();
  });
  btn.addEventListener("pointercancel", () => {
    if (!coarse) stopListen();
  });
}

function render() {
  const disabled = !canRecord() || state.status === "transcribing";
  app.innerHTML = `
    <header class="top">
      <div>
        <h1>stt-<em>mini</em></h1>
        <p class="lede">Hold the pad or Space, talk, release. Whisper runs in this tab. The recording is discarded after transcription.</p>
      </div>
      <div class="privacy">Local-first. Model weights download once. Audio stays on this device.</div>
    </header>

    <div class="grid">
      <aside class="panel">
        <div class="row">
          <label for="model">Model</label>
          <select id="model">
            ${
              (["small.en", "base.en", "tiny.en", "tiny"] as ModelId[])
                .map(
                  (id) =>
                    `<option value="${id}" ${id === state.model ? "selected" : ""}>${id} — ${MODEL_NOTES[id]}</option>`,
                )
                .join("")
            }
          </select>
          <p class="hint">small.en is the default. First load is larger; accuracy is much closer to usable dictation.</p>
        </div>

        <div class="mic-wrap desk-mic">
          <button class="mic ${state.status === "listening" ? "listening" : ""}" type="button" ${disabled ? "disabled" : ""}>
            ${micLabel()}
          </button>
          <div class="status">${escapeHtml(statusLine())}</div>
        </div>
        <div class="meter"><span style="width:${state.progress}%"></span></div>
        <p class="error">${escapeHtml(state.error)}</p>

        <details class="settings-block" ${coarse ? "" : "open"}>
          <summary>Glossary</summary>
          <div class="glossary">
            ${
              state.glossary
                .map(
                  (entry, i) => `
              <div class="g-row" data-i="${i}">
                <input type="text" data-k="from" value="${escapeHtml(entry.from)}" placeholder="heard" />
                <input type="text" data-k="to" value="${escapeHtml(entry.to)}" placeholder="write" />
                <button type="button" data-del="${i}" aria-label="Remove">×</button>
              </div>`,
                )
                .join("")
            }
            <button class="btn" type="button" id="add-term">Add term</button>
          </div>
        </details>
      </aside>

      <section class="panel">
        <div class="tabs">
          <button class="btn ${state.tab === "clean" ? "active" : ""}" type="button" id="tab-clean">Cleaned</button>
          <button class="btn ${state.tab === "raw" ? "active" : ""}" type="button" id="tab-raw">Raw</button>
        </div>
        <div class="outputs show-${state.tab}">
          <div class="col">
            <h2>Raw</h2>
            <pre>${escapeHtml(state.raw) || " "}</pre>
          </div>
          <div class="col">
            <h2>Cleaned</h2>
            <pre>${escapeHtml(state.clean) || " "}</pre>
          </div>
        </div>
        <div class="actions">
          <button class="btn primary" type="button" id="copy-clean">Copy cleaned</button>
          <button class="btn" type="button" id="copy-raw">Copy raw</button>
          <button class="btn" type="button" id="clear">Clear</button>
        </div>
        <div class="stats">
          <span>device ${escapeHtml(state.device)}</span>
          <span>asr ${state.lastMs ? `${state.lastMs}ms` : "—"}</span>
          <span>audio ${state.lastSeconds ? `${state.lastSeconds.toFixed(1)}s` : "—"}</span>
        </div>

        <div class="log">
          <label>Session</label>
          <ol>
            ${
              state.history.length === 0
                ? `<li><time>nothing yet</time>${coarse ? "Tap the orange pad and talk." : "Hold Space and talk."}</li>`
                : state.history
                    .slice(0, 8)
                    .map(
                      (row) => `
              <li>
                <time>${new Date(row.at).toLocaleTimeString()} · ${row.ms}ms · ${row.seconds.toFixed(1)}s</time>
                ${escapeHtml(row.clean || row.raw)}
              </li>`,
                    )
                    .join("")
            }
          </ol>
        </div>
      </section>
    </div>

    <div class="dock">
      <button class="mic ${state.status === "listening" ? "listening" : ""}" type="button" ${disabled ? "disabled" : ""}>
        ${micLabel()}
      </button>
      <div class="status">${escapeHtml(statusLine())}</div>
    </div>
  `;

  app.querySelector<HTMLSelectElement>("#model")?.addEventListener("change", (e) => {
    setModel((e.target as HTMLSelectElement).value as ModelId);
  });

  app.querySelectorAll<HTMLButtonElement>(".mic").forEach(bindMic);

  app.querySelector("#copy-clean")?.addEventListener("click", () => copy(state.clean || state.raw));
  app.querySelector("#copy-raw")?.addEventListener("click", () => copy(state.raw));
  app.querySelector("#clear")?.addEventListener("click", () => {
    state.raw = "";
    state.clean = "";
    render();
  });
  app.querySelector("#add-term")?.addEventListener("click", () => {
    updateGlossary([...state.glossary, { from: "", to: "" }]);
  });
  app.querySelector("#tab-clean")?.addEventListener("click", () => {
    state.tab = "clean";
    render();
  });
  app.querySelector("#tab-raw")?.addEventListener("click", () => {
    state.tab = "raw";
    render();
  });
  app.querySelectorAll(".g-row input").forEach((input) => {
    input.addEventListener("change", () => {
      const row = (input as HTMLElement).closest(".g-row");
      if (!row) return;
      const i = Number(row.getAttribute("data-i"));
      const next = state.glossary.map((e) => ({ ...e }));
      const key = (input as HTMLInputElement).dataset.k as "from" | "to";
      next[i][key] = (input as HTMLInputElement).value;
      updateGlossary(next);
    });
  });
  app.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number((btn as HTMLElement).getAttribute("data-del"));
      updateGlossary(state.glossary.filter((_, idx) => idx !== i));
    });
  });
}

function statusLine() {
  switch (state.status) {
    case "booting":
    case "loading-model":
      return state.progressLabel;
    case "ready":
      return coarse ? "Ready · tap the pad" : "Ready · hold Space";
    case "listening":
      return "Listening";
    case "transcribing":
      return "Transcribing locally";
    case "error":
      return "Error";
  }
}

function isTypingTarget(el: EventTarget | null) {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

window.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat || isTypingTarget(e.target) || coarse) return;
  e.preventDefault();
  void startListen();
});
window.addEventListener("keyup", (e) => {
  if (e.code !== "Space" || isTypingTarget(e.target) || coarse) return;
  e.preventDefault();
  stopListen();
});

render();
worker.postMessage({ type: "load", model: state.model });
