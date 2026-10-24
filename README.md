# Datara

Datara collects original data for individuals, labs, and small and medium organizations. A buyer requests a measurement that does not exist yet and can receive a table, a written report, or a model. Public datasets and baseline training sit on the desk as a tool. The product story lives in `docs/PLAN (1).md`.

## Run locally

```bash
npm install
cp .env.example .env # only if .env does not already exist
npm run dev
```

Open http://localhost:3000. Placeholder credentials are intentionally unused in this phase.

## Included

- Company page for original collection: audiences, deliverables, and worked examples.
- Request desk whose home is open briefs, with search, status filters, and brief detail.
- Domain-neutral brief form. Sensor fields appear only when that method is chosen.
- Recorded public-data links and one recorded baseline, labeled as a tool.
- Local collection queue with simulated status labels and notes.
- Browser-local persistence for briefs and the workspace name.

All statuses, public-data rows, and model metrics are demo fixtures. No authentication, external search, training, calendar booking, or backend is connected. The queue is a UI demonstration, not an authorized admin surface. Local storage is for nonsensitive prototype data only.

## Configuration

`.env` is ignored by Git and contains filler values. `.env.example` documents planned service configuration. Replace values when implementing Clerk, FastAPI, MongoDB, Redis, source adapters, training, and Cal.com. Only variables prefixed with `NEXT_PUBLIC_` may be exposed to the browser; provider secrets stay server-side.

The Next.js app remains at the repository root for this frontend phase. Backend and execution directories can be added incrementally.

## Checks

```bash
npm run lint
npm run build
```
