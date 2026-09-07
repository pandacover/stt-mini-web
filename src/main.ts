import "./style.css";
import { closeMic, openMic, peakLevel, type MicSession } from "./lib/audio";
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

function requireEl<T extends HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing ${selector}`);
  return el;
}

const app = requireEl<HTMLDivElement>("#app");

const state = {
  status: "booting" as AppStatus,
  model: (localStorage.getItem("stt-mini.model") as ModelId) || "tiny.en",
  device: "—",
  progress: 0,
  progressLabel: "Starting worker",
  raw: "",
  clean: "",
  error: "",
  level: 0,
  lastMs: 0,
  lastSeconds: 0,
  glossary: loadGlossary(),
  history: [] as SessionRow[],
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
  return state.status === "ready" || state.status === "listening";
}

async function startListen() {
  if (!canRecord() || mic) return;
  state.error = "";
  try {
    mic = await openMic();
    state.status = "listening";
    meterTimer = window.setInterval(() => {
      if (!mic) return;
      state.level = peakLevel(mic.chunks);
      const button = document.querySelector<HTMLButtonElement>(".mic");
      if (button) button.style.setProperty("--level", String(0.7 + Math.min(state.level, 1) * 0.45));
    }, 80);
    render();
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
  state.level = 0;
  if (captured.seconds < 0.35) {
    state.status = "ready";
    state.error = "Clip was too short. Hold a little longer.";
    render();
    return;
  }
  state.status = "transcribing";
  state.progressLabel = "Transcribing on-device…";
  render();
  worker.postMessage(
    { type: "transcribe", audio: captured.audio, sampleRate: captured.sampleRate },
    [captured.audio.buffer],
  );
}

function setModel(model: ModelId) {
  state.model = model;
  localStorage.setItem("stt-mini.model", model);
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

function render() {
  const disabled = !canRecord();
  app.innerHTML = `
    <header class="top">
      <div>
        <h1>stt-<em>mini</em></h1>
        <p class="lede">Hold the pad or Space, talk, release. Whisper runs in this tab. The recording is discarded after transcription.</p>
      </div>
      <div class="privacy">Local-first testbed. Model weights download once from Hugging Face and cache in the browser. Your audio is not uploaded.</div>
    </header>

    <div class="grid">
      <aside class="panel">
        <div class="row">
          <label for="model">Model</label>
          <select id="model">
            ${
              (["tiny.en", "tiny", "base.en"] as ModelId[])
                .map(
                  (id) =>
                    `<option value="${id}" ${id === state.model ? "selected" : ""}>${id} — ${MODEL_NOTES[id]}</option>`,
                )
                .join("")
            }
          </select>
          <p class="hint">Tiny is the right default for a prototype. Base is slower and sharper on names.</p>
        </div>

        <div class="mic-wrap">
          <button class="mic ${state.status === "listening" ? "listening" : ""}" type="button" ${disabled ? "disabled" : ""}>
            ${state.status === "listening" ? "Release" : "Hold"}
          </button>
          <div class="status">${escapeHtml(statusLine())}</div>
        </div>
        <div class="meter"><span style="width:${state.progress}%"></span></div>
        <p class="error">${escapeHtml(state.error)}</p>

        <div class="row" style="margin-top:18px">
          <label>Glossary</label>
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
        </div>
      </aside>

      <section class="panel">
        <div class="outputs">
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
                ? `<li><time>nothing yet</time>Hold Space and say a product name from the glossary.</li>`
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
  `;

  app.querySelector<HTMLSelectElement>("#model")?.addEventListener("change", (e) => {
    setModel((e.target as HTMLSelectElement).value as ModelId);
  });

  const micBtn = app.querySelector<HTMLButtonElement>(".mic");
  micBtn?.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    void startListen();
  });
  micBtn?.addEventListener("pointerup", () => stopListen());
  micBtn?.addEventListener("pointerleave", () => {
    if (state.status === "listening") stopListen();
  });

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
      return "Ready · hold Space";
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
  if (e.code !== "Space" || e.repeat || isTypingTarget(e.target)) return;
  e.preventDefault();
  void startListen();
});
window.addEventListener("keyup", (e) => {
  if (e.code !== "Space" || isTypingTarget(e.target)) return;
  e.preventDefault();
  stopListen();
});

render();
worker.postMessage({ type: "load", model: state.model });
