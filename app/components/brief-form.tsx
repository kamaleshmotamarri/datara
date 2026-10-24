"use client";

import { useState } from "react";
import { Beam } from "./motion";
import type { Brief } from "../lib/briefs";

const domains = [
  "Individual",
  "Medical lab",
  "Laboratory",
  "Company",
  "Organization",
];

const methods = ["Experiment", "Observation", "Survey", "Sensor"];

export function BriefForm({
  onCancel,
  onInvalidAge,
  onSave,
}: {
  onCancel: () => void;
  onInvalidAge: () => void;
  onSave: (brief: Brief) => void;
}) {
  const [method, setMethod] = useState("Experiment");
  const [error, setError] = useState("");

  return (
    <Beam>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const ageMin = form.get("age_min");
          const ageMax = form.get("age_max");
          if (ageMin && ageMax && Number(ageMin) > Number(ageMax)) {
            onInvalidAge();
            return;
          }
          const deliverables = form
            .getAll("deliverables")
            .map((value) => String(value));
          if (deliverables.length === 0) {
            setError("Choose at least one deliverable.");
            return;
          }
          setError("");
          const title = String(form.get("title"));
          const domain = String(form.get("domain"));
          const question = String(form.get("question"));
          const measure = String(form.get("measure"));
          const observed = String(form.get("observed"));
          const chosen = String(form.get("method"));
          const format = String(form.get("format") || "CSV");
          const labeled = deliverables.map((item) =>
            item === "Table" ? `Table (${format})` : item,
          );
          const details: Record<string, string> = {
            Domain: domain,
            Question: question,
            Measure: measure,
            Observed: observed,
            Method: chosen,
            "Sample count": String(form.get("samples")),
            Deliverables: labeled.join(", "),
            "Table format": format,
          };
          const optional: [string, string][] = [
            ["geography", "Geography"],
            ["desired_date", "Desired date"],
            ["budget", "Budget USD"],
            ["age_min", "Minimum age"],
            ["age_max", "Maximum age"],
            ["quality", "Quality notes"],
            ["device", "Device"],
            ["sampling", "Sampling Hz"],
            ["duration", "Session minutes"],
            ["sessions", "Sessions"],
            ["sync", "Synchronization"],
          ];
          for (const [key, label] of optional) {
            const value = String(form.get(key) || "").trim();
            if (value) details[label] = value;
          }
          if (form.get("consultation")) {
            details.Consultation = "Requested. Booking is not connected.";
          }
          onSave({
            id: `brief-${Date.now()}`,
            title,
            domain,
            question,
            measure,
            observed,
            method: chosen,
            deliverables,
            state: "Pending review",
            notes: `${measure} · ${observed} · ${chosen}. ${labeled.join(", ")}.`,
            updated: "Just now",
            details,
          });
        }}
      >
        <label className="field">
          Request title
          <input
            autoFocus
            name="title"
            required
            maxLength={120}
            placeholder="Mile time from health metrics"
          />
        </label>
        <div className="form-grid">
          <label className="field">
            Who is asking
            <select name="domain" defaultValue="Laboratory">
              {domains.map((domain) => (
                <option key={domain}>{domain}</option>
              ))}
            </select>
          </label>
          <label className="field">
            How it should be collected
            <select
              name="method"
              value={method}
              onChange={(event) => setMethod(event.target.value)}
            >
              {methods.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          Question
          <textarea
            name="question"
            required
            rows={3}
            placeholder="What decision should this data support?"
          />
        </label>
        <label className="field">
          What to measure
          <input
            name="measure"
            required
            placeholder="Mile time, resting heart rate, blood pressure"
          />
        </label>
        <label className="field">
          Who or what is observed
          <input
            name="observed"
            required
            placeholder="Adults completing a supervised mile"
          />
        </label>
        <div className="form-grid">
          <label className="field">
            How many
            <input name="samples" type="number" min="1" defaultValue="100" required />
          </label>
          <label className="field">
            Table format
            <select name="format" defaultValue="CSV">
              <option>CSV</option>
              <option>JSON</option>
              <option>Parquet</option>
            </select>
          </label>
        </div>
        <fieldset className="checks">
          <legend>Deliverables</legend>
          {["Table", "Report", "Model"].map((item) => (
            <label className="check" key={item}>
              <input
                type="checkbox"
                name="deliverables"
                value={item}
                defaultChecked={item !== "Model"}
              />
              <span>{item}</span>
            </label>
          ))}
          {error && <p className="form-error">{error}</p>}
        </fieldset>
        {method === "Sensor" && (
          <>
            <label className="field">
              Device
              <input name="device" required placeholder="Wrist PPG, chest strap" />
            </label>
            <div className="form-grid">
              <label className="field">
                Sampling frequency (Hz)
                <input name="sampling" type="number" min="0.01" step="any" required />
              </label>
              <label className="field">
                Session minutes
                <input name="duration" type="number" min="1" required />
              </label>
              <label className="field">
                Sessions each
                <input name="sessions" type="number" min="1" defaultValue="1" required />
              </label>
            </div>
            <label className="field">
              Synchronization
              <input name="sync" placeholder="Timestamps aligned to a reference clock" />
            </label>
          </>
        )}
        <div className="form-grid">
          <label className="field">
            Geography
            <input name="geography" placeholder="United States" />
          </label>
          <label className="field">
            Desired date
            <input name="desired_date" type="date" />
          </label>
          <label className="field">
            Minimum age
            <input name="age_min" type="number" min="0" max="120" />
          </label>
          <label className="field">
            Maximum age
            <input name="age_max" type="number" min="0" max="120" />
          </label>
          <label className="field">
            Budget (USD, optional)
            <input name="budget" type="number" min="0" />
          </label>
        </div>
        <label className="field">
          Labels and quality
          <textarea
            name="quality"
            rows={2}
            placeholder="What counts as a complete record, and what may be missing."
          />
        </label>
        <label className="check">
          <input type="checkbox" name="consultation" />
          <span>I want a technical consultation. Booking is not connected yet.</span>
        </label>
        <div className="form-actions">
          <button type="button" className="btn line" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn solid" type="submit">
            Save brief
          </button>
        </div>
      </form>
    </Beam>
  );
}
