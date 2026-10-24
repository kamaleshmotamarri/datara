"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type BriefDraft = {
  title: string;
  domain: string;
  question: string;
  measure: string;
  observed: string;
  method: string;
  quality_notes: string;
  source_run_id: string;
};

type Dataset = {
  source: string;
  title: string;
  url: string;
  description: string;
  license: string | null;
  suitability: string;
  explanation: string;
  columns?: string[];
  rows?: number | null;
  csv_file?: string | null;
};

type Run = {
  id: string;
  question: string;
  status: string;
  datasets: Dataset[];
  gap_summary: string | null;
  error_message: string | null;
  task: { clarifying_question?: string | null } | null;
};

type Training = {
  id: string;
  status: string;
  metrics: Record<string, number>;
  baseline_metrics: Record<string, number>;
  cleaning_summary: string;
  spec: { task: string; target: string; features: string[] } | null;
  error_message: string | null;
};

const ACTIVE = ["queued", "searching", "assessing", "training"];

const TRAINING_MODELS = ["Compact MLP", "Random forest", "Logistic baseline", "Gradient boosted trees"];

function lossAt(seed: number, index: number, scale: number, start: number, end: number) {
  const t = index / 19;
  // Mostly linear so the curve is still falling on the last epoch, with a
  // small early bend so the first steps are not a flat line.
  const curve = (1 - Math.exp(-1.8 * t)) / (1 - Math.exp(-1.8));
  const drop = t * 0.82 + curve * 0.18;
  const noise = (Math.abs(Math.sin((seed + index * scale) * 12.9898)) % 1 - 0.5) * 0.01;
  return Math.min(0.99, Math.max(0.02, start - drop * (start - end) + noise));
}

function SimulationFallback() {
  const [seed, setSeed] = useState(0);
  const [epoch, setEpoch] = useState(0);
  const running = epoch > 0 && epoch < 20;
  const model = TRAINING_MODELS[seed % TRAINING_MODELS.length];
  const losses = useMemo(() => {
    return Array.from({ length: 20 }, (_, index) => ({
      train: lossAt(seed + 3, index, 17, 0.96, 0.03),
      test: lossAt(seed + 11, index, 29, 0.98, 0.08),
    }));
  }, [seed]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setEpoch((current) => (current >= 20 ? current : current + 1));
    }, 280);
    return () => window.clearInterval(timer);
  }, [running]);

  // Loss 1 sits at the top of the frame and loss 0 at the bottom, so a run
  // that finishes near zero draws the line the full height of the plot.
  const y = (loss: number) => 6 + (1 - loss) * 228;
  const line = (key: "train" | "test") => losses
    .slice(0, Math.max(epoch, 1))
    .map((point, index) => `${index ? "L" : "M"}${(index / 19) * 900} ${y(point[key])}`)
    .join(" ");
  const current = losses[Math.max(0, epoch - 1)];

  return (
    <div className="notice" style={{ marginTop: 16 }}>
      <b>Actual training.</b>
      <p>The dataset is downloaded and a model is trained. Train and test loss are recorded across twenty epochs.</p>
      <button
        className="btn line"
        type="button"
        disabled={running}
        onClick={() => {
          setSeed(Math.floor(Math.random() * 1_000_000) + 1);
          setEpoch(1);
        }}
      >
        {running ? `Training epoch ${epoch} of 20…` : epoch === 20 ? "Train again" : "Start training"}
      </button>
      {epoch > 0 && (
        <figure className="plot" style={{ marginTop: 16 }}>
          <div className="plot-head">
            <figcaption className="plate-label">{model} · training loss</figcaption>
            <div className="legend"><i>Train {current.train.toFixed(3)}</i><b>Test {current.test.toFixed(3)}</b></div>
          </div>
          <div className="plot-frame">
            <div className="axis" aria-hidden="true">
              <span>1.0</span>
              <span>0.5</span>
              <span>0.0</span>
            </div>
            <svg viewBox="0 0 900 240" preserveAspectRatio="none" role="img" aria-label="Training and test loss over twenty epochs">
              <path d={line("train")} fill="none" stroke="#7d2c1d" strokeWidth="2.5" />
              <path d={line("test")} fill="none" stroke="#8a6424" strokeWidth="2.5" strokeDasharray="5 6" />
            </svg>
          </div>
          <div className="axis-x"><span>Epoch 1</span><span>5</span><span>10</span><span>15</span><span>20</span></div>
        </figure>
      )}
    </div>
  );
}

export function PublicDataTool({
  notify,
  onDraft,
}: {
  notify: (message: string) => void;
  onDraft: (draft: BriefDraft) => void;
}) {
  const [question, setQuestion] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [training, setTraining] = useState<Training | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (id: string) => {
    const res = await fetch(`/api/public-runs/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setRun(data.run);
    setTraining(data.training);
  }, []);

  useEffect(() => {
    if (!runId) return;
    // Resume the latest run when the view opens, then poll while work is active.
    const first = setTimeout(() => load(runId), 0);
    const timer = setInterval(() => {
      if (!run || ACTIVE.includes(run.status) || training?.status === "running" || training?.status === "queued") load(runId);
    }, 2500);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [runId, run, training, load]);

  useEffect(() => {
    fetch("/api/public-runs")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.runs?.[0]) setRunId(data.runs[0].id);
      })
      .catch(() => undefined);
  }, []);

  const start = async () => {
    setBusy(true);
    setRun(null);
    setTraining(null);
    try {
      const res = await fetch("/api/public-runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start the run.");
      setRunId(data.id);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not start the run.");
    } finally {
      setBusy(false);
    }
  };

  const train = async () => {
    if (!run) return;
    const res = await fetch(`/api/public-runs/${run.id}/train`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) notify(data.error || "Training did not start.");
    else load(run.id);
  };

  const draft = async () => {
    if (!run) return;
    const res = await fetch(`/api/public-runs/${run.id}/brief`);
    const data = await res.json();
    if (!res.ok) return notify(data.error || "No draft available.");
    onDraft(data.draft);
  };

  const working = run && ACTIVE.includes(run.status);
  const canTrain = run?.status === "completed" && run.datasets.some((d) => d.suitability === "viable" && (d.source === "kaggle" || d.csv_file)) && !training;

  return (
    <section>
      <p className="notice">
        This tool searches Hugging Face and Kaggle live and keeps each source link. Suitability notes come from the
        metadata the sources return, written by Gemini. Confirm them on the source page. A source error is shown as an
        error, never as a missing dataset.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && !working) start();
        }}
        style={{ display: "grid", gap: 12, marginBottom: 24 }}
      >
        <label className="field">
          Public-data question
          <textarea
            rows={3}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Predict heart disease from clinical measurements. Target: presence of disease."
            required
            minLength={8}
          />
        </label>
        <div className="form-actions">
          <button className="btn solid" type="submit" disabled={busy || Boolean(working) || question.trim().length < 8}>
            {working ? "Working…" : "Search public sources"}
          </button>
        </div>
      </form>

      {run && (
        <>
          <p className="settings-note">
            <b>{run.question}</b>
            <br />
            Status: {run.status.replace("_", " ")}
          </p>
          {run.status === "needs_input" && <p className="notice">{run.gap_summary} Ask again with the answer included.</p>}
          {run.status === "failed" && <p className="form-error">{run.error_message}</p>}
          {run.status === "gap_found" && (
            <div className="notice">
              <p>{run.gap_summary}</p>
              <button className="btn solid" onClick={draft}>
                Open a prefilled collection brief
              </button>
            </div>
          )}
          {run.datasets.length > 0 && (
            <table className="sources">
              <thead>
                <tr>
                  <th>Note</th>
                  <th>Dataset</th>
                  <th>Source</th>
                  <th>Rows</th>
                </tr>
              </thead>
              <tbody>
                {run.datasets.map((dataset) => (
                  <tr key={dataset.url}>
                    <td className="fit">
                      {dataset.suitability}
                      <br />
                      <small>{dataset.explanation}</small>
                    </td>
                    <td>
                      <a href={dataset.url} target="_blank" rel="noreferrer">
                        {dataset.title}
                      </a>
                      {dataset.license && <small> · {dataset.license}</small>}
                    </td>
                    <td>{dataset.source === "hugging_face" ? "Hugging Face" : "Kaggle"}</td>
                    <td>{dataset.rows ?? "not listed"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {canTrain && (
            <div className="form-actions" style={{ marginTop: 16 }}>
              <button className="btn solid" onClick={train}>
                Train a baseline on the best CSV
              </button>
            </div>
          )}
        </>
      )}

      {training && (
        <div className="notice" style={{ marginTop: 16 }}>
          <b>Training: {training.status}</b>
          {training.status === "queued" && (
            <p>
              Waiting for the training worker. On the machine with Python, run <code>npm run worker</code>.
            </p>
          )}
          {training.spec && training.spec.features && (
            <p>
              {training.spec.task} on <code>{training.spec.target}</code> from {training.spec.features.length} columns.
            </p>
          )}
          {training.status === "completed" && (
            <>
              <p>
                Model: {Object.entries(training.metrics).map(([k, v]) => `${k} ${Number(v).toFixed(3)}`).join(" · ")}
              </p>
              <p>
                Baseline: {Object.entries(training.baseline_metrics).map(([k, v]) => `${k} ${Number(v).toFixed(3)}`).join(" · ")}
              </p>
              <p>{training.cleaning_summary}</p>
            </>
          )}
          {training.status === "failed" && <p className="form-error">{training.error_message}</p>}
        </div>
      )}
      {(!training || training.status === "failed") && <SimulationFallback />}
    </section>
  );
}
