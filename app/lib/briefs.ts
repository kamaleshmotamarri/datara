export type BriefState = "Pending review" | "Under collection" | "Fulfilled";

export type Brief = {
  id: string;
  title: string;
  domain: string;
  question: string;
  measure: string;
  observed: string;
  method: string;
  deliverables: string[];
  state: BriefState;
  notes: string;
  updated: string;
  details: Record<string, string>;
};

export const BRIEF_KEY = "datara-briefs";

export const seedBriefs: Brief[] = [
  {
    id: "mile-time",
    title: "Mile time from health metrics",
    domain: "Medical lab",
    question:
      "Can average mile time be estimated from a short panel of health metrics?",
    measure:
      "Mile time, resting heart rate, blood pressure, BMI, age, weekly training minutes",
    observed: "Adults completing a supervised mile",
    method: "Experiment",
    deliverables: ["Table", "Report", "Model"],
    state: "Under collection",
    notes:
      "Northline Medical Lab. Recorded fixture. No fieldwork is running from this browser.",
    updated: "Today",
    details: {
      Domain: "Medical lab",
      Method: "Experiment",
      "Sample count": "240",
      Deliverables: "Table (CSV), report, model",
    },
  },
  {
    id: "heat",
    title: "Neighborhood afternoon heat",
    domain: "Civic organization",
    question:
      "How does street-level shade change afternoon air temperature on a summer block?",
    measure: "Air temperature, shade cover, surface type, time of day",
    observed: "Twelve city blocks, walked at the same hour",
    method: "Observation",
    deliverables: ["Table", "Report"],
    state: "Fulfilled",
    notes: "Recorded delivery: a CSV and a methods note. The files are not attached here.",
    updated: "Last week",
    details: {
      Domain: "Civic organization",
      Method: "Observation",
      "Sample count": "12 blocks",
      Deliverables: "Table (CSV), report",
    },
  },
  {
    id: "stops",
    title: "Stop delays on a regional route",
    domain: "Logistics firm",
    question: "Which stop-level conditions add minutes to a delivery route?",
    measure: "Stop duration, weather, shift hour, dock type",
    observed: "One regional carrier, four weeks of stops",
    method: "Observation",
    deliverables: ["Table", "Report", "Model"],
    state: "Pending review",
    notes: "Waiting on protocol review. This label lives in the browser.",
    updated: "Yesterday",
    details: {
      Domain: "Logistics firm",
      Method: "Observation",
      "Sample count": "4 weeks of stops",
      Deliverables: "Table (CSV), report, model",
    },
  },
];

export function loadBriefs(): Brief[] {
  if (typeof window === "undefined") return seedBriefs;
  try {
    const raw = localStorage.getItem(BRIEF_KEY);
    if (!raw) return seedBriefs;
    const parsed = JSON.parse(raw) as Brief[];
    if (!Array.isArray(parsed) || parsed.length === 0) return seedBriefs;
    const briefs = parsed.filter((brief) => brief && typeof brief.title === "string");
    return briefs.length ? briefs : seedBriefs;
  } catch {
    return seedBriefs;
  }
}

export function persistBriefs(briefs: Brief[]) {
  localStorage.setItem(BRIEF_KEY, JSON.stringify(briefs));
}

/** Maps the form's Brief to the server's validated payload. */
export function toApiPayload(brief: Brief) {
  const d = brief.details;
  const num = (key: string) => {
    const n = Number(d[key]);
    return d[key] && Number.isFinite(n) ? n : null;
  };
  const method = brief.method.toLowerCase();
  return {
    title: brief.title,
    domain: brief.domain,
    question: brief.question,
    measure: brief.measure,
    observed: brief.observed,
    sample_count: num("Sample count") ? Math.round(num("Sample count")!) : null,
    method,
    sensor:
      method === "sensor"
        ? {
            device: d["Device"] ?? "",
            sampling_hz: num("Sampling Hz") ?? 1,
            session_minutes: num("Session minutes") ?? 1,
            sessions: Math.round(num("Sessions") ?? 1),
            synchronization: d["Synchronization"] ?? "",
          }
        : null,
    deliverables: {
      table: brief.deliverables.includes("Table"),
      report: brief.deliverables.includes("Report"),
      model: brief.deliverables.includes("Model"),
      table_format: d["Table format"] ?? "CSV",
    },
    geography: d["Geography"] ?? "",
    age_min: num("Minimum age"),
    age_max: num("Maximum age"),
    desired_date: d["Desired date"] || null,
    budget_usd: num("Budget USD"),
    quality_notes: d["Quality notes"] ?? "",
    consultation_requested: Boolean(d["Consultation"]),
  };
}
