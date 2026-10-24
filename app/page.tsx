"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BriefForm } from "./components/brief-form";
import { Beam, DeliverableSet, MetalButton, StatusOrb } from "./components/motion";
import { persistBriefs, loadBriefs, type Brief } from "./lib/briefs";

const examples = [
  {
    domain: "Medical lab",
    title: "Mile time from health metrics",
    text: "A lab wants average mile time from a short health panel. That table has not been published. The brief asks a team to collect it.",
    state: "Under collection",
    live: true,
  },
  {
    domain: "Civic organization",
    title: "Neighborhood afternoon heat",
    text: "Walked routes record shade, surface, and air temperature. The recorded delivery is a CSV and a methods note.",
    state: "Fulfilled",
    live: false,
  },
  {
    domain: "Logistics firm",
    title: "Stop delays on a regional route",
    text: "Stop duration against weather, shift hour, and dock type. The brief is waiting on review.",
    state: "Pending review",
    live: false,
  },
];

export default function HomePage() {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const save = (brief: Brief) => {
    persistBriefs([brief, ...loadBriefs()]);
    setOpen(false);
    setToast("Brief saved in this browser. It is on the desk.");
  };

  return (
    <div className="site">
      <header className="site-bar">
        <Link className="mark" href="/" aria-label="Datara home">
          Datara<i>.</i>
        </Link>
        <nav aria-label="Company">
          <a href="#examples">Examples</a>
          <a href="#method">Method</a>
          <Link href="/desk">Desk</Link>
        </nav>
      </header>

      <main className="site-sheet">
        <section className="hero">
          <div>
            <div className="kicker">Original data</div>
            <h1>Data that does not exist yet.</h1>
            <p className="lede hero-lede">
              Datara collects it for individuals, labs, and small and medium
              organizations. You describe the measurement. A team runs the
              collection. You receive a table, a written report, and a model
              when you ask for one.
            </p>
            <div className="hero-actions">
              <MetalButton onClick={() => setOpen(true)}>
                Request a collection
              </MetalButton>
              <Link className="btn line" href="/desk">
                Open the desk
              </Link>
            </div>
          </div>
          <figure className="plate">
            <figcaption className="plate-label">Who it is for</figcaption>
            <ol>
              <li>An individual with a question and no public table.</li>
              <li>A lab that needs a measurement it cannot download.</li>
              <li>A company or organization with the same kind of gap.</li>
            </ol>
          </figure>
        </section>

        <section className="deliverables" aria-label="What comes back">
          <div className="plate-label">What comes back</div>
          <DeliverableSet />
        </section>

        <section className="audiences" aria-label="Audiences">
          <div className="audience">
            <b>01</b>
            <span>Individuals</span>
            <p>A personal study, a class project, a question you cannot scrape.</p>
          </div>
          <div className="audience">
            <b>02</b>
            <span>Labs</span>
            <p>Medical and other laboratories that need observations they do not have.</p>
          </div>
          <div className="audience">
            <b>03</b>
            <span>Organizations</span>
            <p>Small and medium firms, civic groups, and teams between them.</p>
          </div>
        </section>

        <section id="examples">
          <div className="section-row">
            <h2>Three briefs</h2>
            <p className="quiet">The field changes. The request is the same shape.</p>
          </div>
          <div className="examples">
            {examples.map((example) => {
              const card = (
                <article className="example">
                  <div className="plate-label">{example.domain}</div>
                  <h3>{example.title}</h3>
                  <p>{example.text}</p>
                  <span className={`stamp ${example.live ? "live" : example.state === "Fulfilled" ? "done" : "gap"}`}>
                    {example.live && <StatusOrb label="Under collection" />}
                    {example.state}
                  </span>
                </article>
              );
              return example.live ? (
                <Beam key={example.title}>{card}</Beam>
              ) : (
                <div key={example.title}>{card}</div>
              );
            })}
          </div>
        </section>

        <section id="method" className="spread method">
          <div>
            <h2>Write it. Collect it. Receive it.</h2>
            <p className="lede">
              A brief names the question, the measurement, who or what is
              observed, and whether the work is an experiment, an observation,
              a survey, or a sensor protocol.
            </p>
            <button className="btn solid" type="button" onClick={() => setOpen(true)}>
              Request a collection
            </button>
          </div>
          <figure className="plate">
            <figcaption className="plate-label">Fig. 01 — A collection</figcaption>
            <ol>
              <li>File the brief and choose the files you want back.</li>
              <li>A team designs the collection and runs it.</li>
              <li>You receive the table, the report, and a model if you asked.</li>
            </ol>
          </figure>
        </section>

        <section className="tool-strip" id="public-data">
          <div>
            <div className="plate-label">Also on the desk</div>
            <h2>Public data, when it already exists.</h2>
            <p>
              Kaggle, Hugging Face, and other public sets can be read, compared,
              and combined. A small model can be trained when the rows are
              enough. That tool sits behind the collection request.
            </p>
          </div>
          <Link className="btn line" href="/desk?view=public">
            Open the public-data tool
          </Link>
        </section>

        <footer className="page-foot">
          <span>Datara</span>
          <span>Frontend desk · collection is not running from this browser</span>
        </footer>
      </main>

      {open && (
        <div className="modal-root" onClick={() => setOpen(false)}>
          <section
            className="folio"
            role="dialog"
            aria-modal="true"
            aria-label="Collection brief"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="icon-btn folio-close"
              aria-label="Close dialog"
              onClick={() => setOpen(false)}
            >
              <CloseIcon />
            </button>
            <div className="kicker">Collection brief</div>
            <h2>Name the measurement.</h2>
            <p className="lede">
              Protocol only. Leave out names, contact details, and health records.
            </p>
            <BriefForm
              onCancel={() => setOpen(false)}
              onInvalidAge={() =>
                setToast("Maximum age must be greater than or equal to minimum age.")
              }
              onSave={save}
            />
          </section>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button aria-label="Dismiss notification" onClick={() => setToast("")}>
            <CloseIcon />
          </button>
        </div>
      )}
    </div>
  );
}

function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="m6 6 12 12M6 18 18 6" />
    </svg>
  );
}
