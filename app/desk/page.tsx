"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BriefForm } from "../components/brief-form";
import { Beam, MetalButton, StatusOrb } from "../components/motion";
import {
  loadBriefs,
  persistBriefs,
  seedBriefs,
  type Brief,
  type BriefState,
} from "../lib/briefs";

type View = "Requests" | "Public data" | "Models" | "Collection queue" | "Settings";

type Turn = { role: "user" | "desk"; text: string };

const navItems: [View, string][] = [
  ["Requests", "01"],
  ["Public data", "02"],
  ["Models", "03"],
  ["Collection queue", "04"],
  ["Settings", "05"],
];

const datasets = [
  {
    title: "UCI HAR Dataset",
    source: "UCI Repository",
    rows: "10,299",
    match: "Recorded",
    url: "https://archive.ics.uci.edu/dataset/240/human+activity+recognition+using+smartphones",
  },
  {
    title: "Human Activity Recognition",
    source: "Kaggle",
    rows: "10,299",
    match: "Recorded",
    url: "https://www.kaggle.com/datasets/uciml/human-activity-recognition-with-smartphones",
  },
  {
    title: "Heart Disease",
    source: "UCI Repository",
    rows: "303",
    match: "Recorded",
    url: "https://archive.ics.uci.edu/dataset/45/heart+disease",
  },
];

function stampClass(state: string) {
  if (state === "Fulfilled") return "done";
  if (state === "Under collection") return "live";
  return "gap";
}

function answer(question: string, briefs: Brief[]) {
  const text = question.toLowerCase();
  if (/mile|health|medical|northline/.test(text)) {
    return "Mile time from health metrics is under collection for a medical lab. The brief asks for a table, a report, and a model. The label is stored in this browser. No field team is running.";
  }
  if (/heat|shade|neighborhood|civic/.test(text)) {
    return "Neighborhood afternoon heat is marked fulfilled. The recorded delivery is a CSV and a methods note. Those files are not attached here.";
  }
  if (/stop|delay|logistics|route/.test(text)) {
    return "Stop delays on a regional route is pending review. It is a logistics brief, waiting on a protocol label in this browser.";
  }
  if (/public|kaggle|hugging|library|uci|dataset/.test(text)) {
    return "Public data is a tool on this desk. The library lists recorded UCI and Kaggle links. Combining those tables, and live search, are not connected.";
  }
  if (/model|accuracy|baseline|pytorch|train/.test(text)) {
    return "Models holds one recorded baseline from a public activity-recognition set: 94.2% test accuracy and 0.938 macro-F1. Those figures were not produced by a training job in this browser.";
  }
  if (/brief|request|queue|ticket|status/.test(text)) {
    return `This browser is holding ${briefs.length} brief${briefs.length === 1 ? "" : "s"}: ${briefs
      .map((brief) => `${brief.title} (${brief.state.toLowerCase()})`)
      .join("; ")}. Changing a queue label does not start collection.`;
  }
  if (/demo|limit|real|backend|what can/.test(text)) {
    return "This is a frontend desk. Search, training, sign-in, and calendar booking are not connected. Briefs stay in this browser.";
  }
  return "I can read the briefs on this desk, the recorded public-data links, and the activity-recognition fixture. Ask about one of those by name.";
}

export default function DeskPage() {
  const [view, setView] = useState<View>("Requests");
  const [briefs, setBriefs] = useState<Brief[]>(seedBriefs);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"All" | BriefState>("All");
  const [selected, setSelected] = useState<Brief | null>(null);
  const [modal, setModal] = useState<"brief" | "help" | null>(null);
  const [toast, setToast] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [thinking, setThinking] = useState(false);
  const [workspace, setWorkspace] = useState("Studio workspace");

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const requested = params.get("view");
      if (requested === "public") setView("Public data");
      if (requested === "models") setView("Models");
      if (requested === "queue") setView("Collection queue");
      setBriefs(loadBriefs());
      setWorkspace(localStorage.getItem("datara-workspace") || "Studio workspace");
      setLoaded(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (loaded && briefs.length) persistBriefs(briefs);
  }, [briefs, loaded]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModal(null);
        setAssistantOpen(false);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document
          .querySelector<HTMLInputElement>('input[aria-label="Search requests"]')
          ?.focus();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setAssistantOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const nav = (next: View) => {
    setView(next);
    setSelected(null);
    setQuery("");
  };

  const visible = briefs.filter((brief) => {
    const haystack = `${brief.title} ${brief.question} ${brief.domain}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (filter === "All" || brief.state === filter);
  });

  const notify = (message: string) => setToast(message);

  const ask = (text: string) => {
    const cleaned = text.trim();
    if (!cleaned || thinking) return;
    setDraft("");
    setTurns((prev) => [...prev, { role: "user", text: cleaned }]);
    setThinking(true);
    window.setTimeout(() => {
      setTurns((prev) => [...prev, { role: "desk", text: answer(cleaned, briefs) }]);
      setThinking(false);
    }, 700);
  };

  const counts = {
    open: briefs.length,
    collecting: briefs.filter((brief) => brief.state === "Under collection").length,
    fulfilled: briefs.filter((brief) => brief.state === "Fulfilled").length,
    waiting: briefs.filter((brief) => brief.state === "Pending review").length,
  };

  const headings: Record<View, { title: string; lede: string }> = {
    Requests: {
      title: "Open requests",
      lede: "Briefs for measurements that are not in a public set. Status labels on this desk stay in the browser.",
    },
    "Public data": {
      title: "Public data",
      lede: "A tool for Kaggle, Hugging Face, and other public sets. Recorded links only. Live search is not connected.",
    },
    Models: {
      title: "Models",
      lede: "When a public table is enough, this tool can train a small baseline. The scores below were written for the demo.",
    },
    "Collection queue": {
      title: "Collection queue",
      lede: "Demo briefs only. A state change here is a label, not a collection.",
    },
    Settings: {
      title: "Desk",
      lede: "Name the workspace. Nothing here leaves the browser.",
    },
  };

  return (
    <div className={`desk ${assistantOpen ? "with-scout" : ""}`}>
      <aside className="spine">
        <Link className="mark" href="/" aria-label="Datara home">
          Datara<i>.</i>
        </Link>
        <div className="spine-kicker">Collection desk</div>
        <nav aria-label="Desk">
          {navItems.map(([item, index]) => (
            <button
              key={item}
              className={`nav-btn ${view === item && !selected ? "active" : ""}`}
              aria-current={view === item && !selected ? "page" : undefined}
              onClick={() => nav(item)}
            >
              <span className="nav-idx">{index}</span>
              <span>{item === "Collection queue" ? "Queue" : item}</span>
              {item === "Requests" && <span className="count-pill">{briefs.length}</span>}
            </button>
          ))}
        </nav>
        <div className="spine-foot">
          <button className="who" onClick={() => nav("Settings")}>
            <span className="initials">SK</span>
            <span>
              Sam Kim
              <small>Buyer · demo</small>
            </span>
          </button>
        </div>
      </aside>

      <div className="sheet">
        <header className="mast">
          <div className="crumbs">
            <Link href="/">Datara</Link>
            <span aria-hidden="true">/</span>
            <strong>{selected ? selected.title : headings[view].title}</strong>
          </div>
          <div className="mast-actions">
            <span className="mast-meta">Recorded fixtures</span>
            <button
              className="icon-btn"
              aria-label="Notifications"
              onClick={() => notify("Nothing waiting. The briefs already on the desk are loaded.")}
            >
              <Icon name="bell" />
              <i className="dot" />
            </button>
            <button className="btn line" onClick={() => setAssistantOpen((open) => !open)}>
              {assistantOpen ? "Close desk" : "Ask the desk"}
            </button>
          </div>
        </header>

        <main>
          {selected ? (
            <BriefDetail brief={selected} onBack={() => setSelected(null)} />
          ) : (
            <>
              <div className="page-head">
                <div>
                  <div className="kicker">Datara collection desk</div>
                  <h1>{headings[view].title}</h1>
                  <p className="lede">{headings[view].lede}</p>
                </div>
                {view === "Requests" || view === "Collection queue" ? (
                  <MetalButton onClick={() => setModal("brief")}>New request</MetalButton>
                ) : null}
              </div>

              {view === "Requests" && (
                <>
                  <section className="spread">
                    <div>
                      <h2>Name the measurement that is missing.</h2>
                      <p className="lede">
                        A brief is the product. Public sets and a small model are
                        tools for the questions that already have rows.
                      </p>
                      <button className="btn line" onClick={() => setModal("brief")}>
                        Write a brief
                      </button>
                    </div>
                    <figure className="plate">
                      <figcaption className="plate-label">Fig. 01 — A request</figcaption>
                      <ol>
                        <li>Name the question, the measurement, and who is observed.</li>
                        <li>Choose a table, a report, a model, or all three.</li>
                        <li>The desk keeps the brief and its status label.</li>
                        <li>A team collects it. This browser does not.</li>
                      </ol>
                    </figure>
                  </section>
                  <section className="measures" aria-label="Request totals">
                    <div className="measure">
                      <b>{String(counts.open).padStart(2, "0")}</b>
                      <span>Briefs on the desk</span>
                    </div>
                    <div className="measure">
                      <b>{String(counts.collecting).padStart(2, "0")}</b>
                      <span>Under collection</span>
                    </div>
                    <div className="measure">
                      <b>{String(counts.waiting).padStart(2, "0")}</b>
                      <span>Pending review</span>
                    </div>
                    <div className="measure">
                      <b>{String(counts.fulfilled).padStart(2, "0")}</b>
                      <span>Fulfilled labels</span>
                    </div>
                  </section>
                  <div className="section-row">
                    <h2>Briefs</h2>
                  </div>
                  <div className="toolbar">
                    <div className="filters" role="tablist" aria-label="Filter requests">
                      {(["All", "Pending review", "Under collection", "Fulfilled"] as const).map(
                        (value) => (
                          <button
                            key={value}
                            className={filter === value ? "on" : ""}
                            onClick={() => setFilter(value)}
                          >
                            {value === "All" ? "All" : value}
                          </button>
                        ),
                      )}
                    </div>
                    <label className="search">
                      <Icon name="search" size={16} />
                      <input
                        aria-label="Search requests"
                        placeholder="Search requests"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                      <kbd>⌘K</kbd>
                    </label>
                  </div>
                  <div className="col-head" aria-hidden="true">
                    <span>No.</span>
                    <span>Request</span>
                    <span>Who</span>
                    <span>State</span>
                    <span>Updated</span>
                  </div>
                  {visible.map((brief, index) => {
                    const row = (
                      <button
                        className="entry"
                        onClick={() => setSelected(brief)}
                      >
                        <span className="idx">{String(index + 1).padStart(2, "0")}</span>
                        <span>
                          <h3>{brief.title}</h3>
                          <p>{brief.question}</p>
                        </span>
                        <span className="task">{brief.domain}</span>
                        <span className={`stamp ${stampClass(brief.state)}`}>
                          {brief.state === "Under collection" && (
                            <StatusOrb label="Under collection" />
                          )}
                          {brief.state}
                        </span>
                        <span className="when">{brief.updated}</span>
                      </button>
                    );
                    return brief.state === "Under collection" ? (
                      <Beam key={brief.id}>{row}</Beam>
                    ) : (
                      <div key={brief.id}>{row}</div>
                    );
                  })}
                  {visible.length === 0 && (
                    <div className="empty">
                      <h3>No brief by that name.</h3>
                      <p>Clear the filter, or write a new one.</p>
                    </div>
                  )}
                </>
              )}

              {view === "Public data" && <DatasetTable />}
              {view === "Models" && <Results />}
              {view === "Collection queue" && (
                <Queue
                  briefs={briefs}
                  onChange={setBriefs}
                  onCreate={() => setModal("brief")}
                />
              )}
              {view === "Settings" && (
                <section className="settings">
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      localStorage.setItem(
                        "datara-workspace",
                        String(form.get("workspace")),
                      );
                      notify("Workspace name saved in this browser.");
                    }}
                  >
                    <label>
                      Workspace name
                      <input name="workspace" defaultValue={workspace} key={workspace} required />
                    </label>
                    <label>
                      Mode
                      <input value="Frontend demo · local browser storage" readOnly />
                    </label>
                    <button className="btn solid" type="submit">
                      Save
                    </button>
                  </form>
                  <p className="settings-note">
                    Sign-in, live search, training, and calendar booking are a
                    later phase. This desk does not ask for provider keys.
                  </p>
                </section>
              )}
            </>
          )}

          <footer className="page-foot">
            <button className="btn ghost" onClick={() => setModal("help")}>
              How a brief works
            </button>
            <span>Fixtures only · collection is not running in this browser</span>
          </footer>
        </main>
      </div>

      {assistantOpen && (
        <aside className="scout" aria-label="Desk assistant">
          <div className="scout-head">
            <div>
              <h2>Desk</h2>
              <p>Reads these briefs · no live search</p>
            </div>
            <button
              className="icon-btn"
              aria-label="Close desk assistant"
              onClick={() => setAssistantOpen(false)}
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="transcript">
            {turns.length === 0 && (
              <>
                <p className="prose">Ask about a brief, a delivery, or this demo.</p>
                <p className="hint">Answers come from the briefs and fixtures already on the page.</p>
                <div className="suggests">
                  {[
                    "Where is the mile-time request?",
                    "What did the heat study deliver?",
                    "What can this demo actually do?",
                  ].map((prompt) => (
                    <button key={prompt} onClick={() => ask(prompt)}>
                      {prompt}
                    </button>
                  ))}
                </div>
              </>
            )}
            {turns.map((turn, index) => (
              <p className={`msg ${turn.role}`} key={`${turn.role}-${index}`}>
                {turn.text}
              </p>
            ))}
            {thinking && (
              <div className="thinking">
                <StatusOrb label="Reading the desk" />
                Reading the desk
              </div>
            )}
          </div>
          <Beam>
            <form
              className="composer"
              onSubmit={(event) => {
                event.preventDefault();
                ask(draft);
              }}
            >
              <textarea
                aria-label="Message the desk"
                placeholder="Ask about a brief"
                rows={2}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    ask(draft);
                  }
                }}
              />
              <button className="btn solid" type="submit" disabled={thinking || !draft.trim()}>
                Send
              </button>
            </form>
          </Beam>
        </aside>
      )}

      {modal && (
        <div className="modal-root" onClick={() => setModal(null)}>
          <section
            className="folio"
            role="dialog"
            aria-modal="true"
            aria-label={modal === "brief" ? "Collection brief" : "How a brief works"}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="icon-btn folio-close"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <Icon name="close" />
            </button>
            <div className="kicker">{modal === "brief" ? "Collection brief" : "How a brief moves"}</div>
            <h2>{modal === "brief" ? "Name the measurement." : "Collection first."}</h2>
            <p className="lede">
              {modal === "brief"
                ? "Protocol only. Leave out names, contact details, and health records."
                : "The desk stores a brief. Public data is a separate tool."}
            </p>
            {modal === "help" ? (
              <>
                <div className="help-step">
                  <b>01</b>
                  <div>
                    <h3>Write the brief</h3>
                    <p>Question, measurement, who is observed, and the files you want back.</p>
                  </div>
                </div>
                <div className="help-step">
                  <b>02</b>
                  <div>
                    <h3>Keep the status honest</h3>
                    <p>The queue can relabel a brief. It cannot collect it.</p>
                  </div>
                </div>
                <div className="help-step">
                  <b>03</b>
                  <div>
                    <h3>Use public data when the rows exist</h3>
                    <p>The library and the recorded baseline stay on their own views.</p>
                  </div>
                </div>
                <button className="btn solid" onClick={() => setModal("brief")}>
                  Write a brief
                </button>
              </>
            ) : (
              <BriefForm
                onCancel={() => setModal(null)}
                onInvalidAge={() =>
                  notify("Maximum age must be greater than or equal to minimum age.")
                }
                onSave={(brief) => {
                  setBriefs([brief, ...briefs]);
                  setView("Requests");
                  setFilter("All");
                  setSelected(null);
                  setModal(null);
                  notify("Brief saved in this browser.");
                }}
              />
            )}
          </section>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button aria-label="Dismiss notification" onClick={() => setToast("")}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function BriefDetail({ brief, onBack }: { brief: Brief; onBack: () => void }) {
  return (
    <>
      <button className="back" onClick={onBack}>
        ← Requests
      </button>
      <div className="page-head">
        <div>
          <div className="kicker">
            {brief.domain} · {brief.method}
          </div>
          <h1>{brief.title}</h1>
          <p className="lede">{brief.question}</p>
        </div>
        <span className={`stamp ${stampClass(brief.state)}`}>
          {brief.state === "Under collection" && <StatusOrb label="Under collection" />}
          {brief.state}
        </span>
      </div>
      <div className="detail-grid">
        <section className="block">
          <h2>Brief</h2>
          <p>
            {brief.measure} Observed: {brief.observed}.
          </p>
          <div className="specs">
            <div>
              <span>Method</span>
              {brief.method}
            </div>
            <div>
              <span>Deliverables</span>
              {brief.deliverables.join(", ")}
            </div>
            <div>
              <span>Updated</span>
              {brief.updated}
            </div>
          </div>
        </section>
        <section className="plate">
          <div className="plate-label">Promised files</div>
          <ol>
            {brief.deliverables.map((item) => (
              <li key={item}>{item}</li>
            ))}
            <li>Status on this desk is a label.</li>
          </ol>
        </section>
      </div>
      <section className="manila">
        <div>
          <h2>
            {brief.state === "Fulfilled"
              ? "The recorded delivery is described here."
              : "The public sets do not carry this measurement."}
          </h2>
          <p>{brief.notes}</p>
        </div>
      </section>
      {Object.keys(brief.details).length > 0 && (
        <details className="request-details">
          <summary>Full brief</summary>
          {Object.entries(brief.details).map(([key, value]) => (
            <p key={key}>
              <strong>{key}: </strong>
              {value}
            </p>
          ))}
        </details>
      )}
    </>
  );
}

function DatasetTable() {
  return (
    <section>
      <p className="notice">
        Suitability and row counts are recorded examples. Confirm both on the
        source page. Combining these tables is part of the tool, and it is not
        running here.
      </p>
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
          {datasets.map((dataset) => (
            <tr key={dataset.title}>
              <td className="fit">{dataset.match}</td>
              <td>
                <a href={dataset.url} target="_blank" rel="noreferrer">
                  {dataset.title}
                </a>
              </td>
              <td>{dataset.source}</td>
              <td>{dataset.rows}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Results() {
  const download = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            demo: true,
            project: "Human activity recognition",
            source: "Public dataset fixture",
            metrics: { accuracy: 0.942, macro_f1: 0.938 },
            note: "Illustrative frontend fixture. No model was trained.",
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = "demo-metrics.json";
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };

  return (
    <>
      <p className="notice">
        Recorded demo results from a public activity set. These metrics are
        illustrative. No training has been executed.
      </p>
      <div className="section-row">
        <h2>Human activity recognition</h2>
        <button className="btn line" onClick={download}>
          Download fixture
        </button>
      </div>
      <div className="metric-row">
        {[
          ["94.2%", "Test accuracy"],
          ["0.938", "Macro F1"],
          ["18.3%", "Majority baseline"],
          ["20", "Epochs"],
        ].map(([value, label]) => (
          <div className="metric" key={label}>
            <b>{value}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <figure className="plot">
        <div className="plot-head">
          <figcaption className="plate-label">Fig. 02 — Loss over twenty epochs</figcaption>
          <div className="legend">
            <i>Train</i>
            <b>Validation</b>
          </div>
        </div>
        <div className="plot-frame">
          <div className="axis" aria-hidden="true">
            <span>1.0</span>
            <span>0.5</span>
            <span>0.0</span>
          </div>
          <svg
            viewBox="0 0 900 240"
            preserveAspectRatio="none"
            role="img"
            aria-label="Illustrative training and validation loss decrease over twenty epochs"
          >
            <path
              d="M0 15C80 90 100 90 150 125S240 163 300 178S430 204 500 210S700 221 900 229"
              fill="none"
              stroke="#7d2c1d"
              strokeWidth="2.5"
            />
            <path
              d="M0 28C80 80 100 110 150 118S240 155 300 166S430 190 500 193S700 200 900 205"
              fill="none"
              stroke="#8a6424"
              strokeWidth="2.5"
              strokeDasharray="5 6"
            />
          </svg>
        </div>
        <div className="axis-x">
          <span>Epoch 1</span>
          <span>5</span>
          <span>10</span>
          <span>15</span>
          <span>20</span>
        </div>
      </figure>
    </>
  );
}

function Queue({
  briefs,
  onChange,
  onCreate,
}: {
  briefs: Brief[];
  onChange: (next: Brief[]) => void;
  onCreate: () => void;
}) {
  if (briefs.length === 0) {
    return (
      <div className="empty">
        <h3>No brief on the desk.</h3>
        <p>Start from the measurement you need collected.</p>
        <button className="btn solid" onClick={onCreate} style={{ marginTop: 14 }}>
          New request
        </button>
      </div>
    );
  }
  return (
    <div>
      {briefs.map((brief, index) => (
        <article className="ticket" key={brief.id}>
          <div className="ticket-no">DR-{String(index + 1).padStart(3, "0")}</div>
          <div>
            <h3>{brief.title}</h3>
            <p>
              {brief.domain} · {brief.method} · {brief.deliverables.join(", ")}
            </p>
            <details className="request-details">
              <summary>Full brief</summary>
              <p>{brief.question}</p>
              {Object.entries(brief.details).map(([key, value]) => (
                <p key={key}>
                  <strong>{key}: </strong>
                  {value}
                </p>
              ))}
            </details>
          </div>
          <div>
            <label>
              Simulated state
              <select
                value={brief.state}
                onChange={(event) =>
                  onChange(
                    briefs.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, state: event.target.value as BriefState }
                        : item,
                    ),
                  )
                }
              >
                {(["Pending review", "Under collection", "Fulfilled"] as const).map((state) => (
                  <option key={state}>{state}</option>
                ))}
              </select>
            </label>
            <label>
              Notes
              <textarea
                aria-label={`Notes for ${brief.title}`}
                value={brief.notes}
                onChange={(event) =>
                  onChange(
                    briefs.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, notes: event.target.value } : item,
                    ),
                  )
                }
              />
            </label>
          </div>
        </article>
      ))}
    </div>
  );
}

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    search: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4 4" />
      </>
    ),
    bell: (
      <>
        <path d="M6 16h12l-1.5-3.5V10a4.5 4.5 0 0 0-9 0v2.5Z" />
        <path d="M10 18.5a2 2 0 0 0 4 0" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
