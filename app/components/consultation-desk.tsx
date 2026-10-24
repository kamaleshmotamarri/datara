"use client";

import { useEffect, useMemo, useState } from "react";
import { chicagoDayKey, chicagoDayLabel, formatSlotRange, type Slot } from "../lib/consultations";

type Appointment = {
  id: string;
  party: "user" | "organization";
  organization_name: string | null;
  topic: string;
  notes: string;
  starts_at: string;
  ends_at: string;
  status: "scheduled" | "cancelled";
};

type Organization = { id: string; name: string; type: string };

const ORG_TYPES = [
  ["lab", "Lab"],
  ["company", "Company"],
  ["organization", "Organization"],
  ["individual", "Individual"],
] as const;

export function ConsultationDesk({ notify }: { notify: (message: string) => void }) {
  const [party, setParty] = useState<"user" | "organization">("user");
  const [organizationId, setOrganizationId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState<(typeof ORG_TYPES)[number][0]>("lab");
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [day, setDay] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = async () => {
    const res = await fetch("/api/consultations");
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "Could not load the calendar.");
    const nextSlots = (data.slots ?? []) as Slot[];
    const nextOrgs = (data.organizations ?? []) as Organization[];
    setSlots(nextSlots);
    setOrganizations(nextOrgs);
    setAppointments((data.appointments ?? []) as Appointment[]);
    setNow(Date.now());
    setDay((current) => {
      const keys = [...new Set(nextSlots.map((slot) => chicagoDayKey(slot.starts_at)))];
      return keys.includes(current) ? current : (keys[0] ?? "");
    });
    setOrganizationId((current) => current || nextOrgs[0]?.id || "new");
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      load()
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load the calendar."))
        .finally(() => setLoading(false));
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const days = useMemo(() => {
    const grouped = new Map<string, Slot>();
    for (const slot of slots) {
      const key = chicagoDayKey(slot.starts_at);
      if (!grouped.has(key)) grouped.set(key, slot);
    }
    return [...grouped.entries()];
  }, [slots]);

  const times = slots.filter((slot) => chicagoDayKey(slot.starts_at) === day);
  const creatingOrg = party === "organization" && organizationId === "new";
  const canBook =
    topic.trim().length >= 8 &&
    Boolean(startsAt) &&
    (party === "user" || (creatingOrg ? orgName.trim().length >= 2 : Boolean(organizationId)));

  const book = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/consultations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          party,
          topic,
          notes,
          starts_at: startsAt,
          organization_id: party === "organization" && !creatingOrg ? organizationId : null,
          organization: creatingOrg ? { name: orgName, type: orgType, description: "" } : null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not book that time.");
      setTopic("");
      setNotes("");
      setStartsAt("");
      setOrgName("");
      await load();
      notify(`Booked ${formatSlotRange(data.appointment.starts_at)}. The collection team holds that slot.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not book that time.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (appointment: Appointment) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/consultations/${appointment.id}`, { method: "PATCH" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not cancel.");
      await load();
      notify("Appointment cancelled. The time is open again.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not cancel.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <p className="notice">
        Thirty minutes with the collection team, on weekdays from 9:00 to 4:30 Central. Booking holds the slot for
        you or for an organization. It does not start a collection.
      </p>
      {error && <p className="form-error">{error}</p>}
      {loading ? (
        <p className="settings-note">Loading open times.</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canBook && !busy) book();
          }}
        >
          <div className="filters" role="tablist" aria-label="Who the appointment is for">
            <button type="button" className={party === "user" ? "on" : ""} onClick={() => setParty("user")}>
              For yourself
            </button>
            <button
              type="button"
              className={party === "organization" ? "on" : ""}
              onClick={() => setParty("organization")}
            >
              For an organization
            </button>
          </div>

          {party === "organization" && (
            <div className="form-grid" style={{ marginTop: 16 }}>
              <label className="field">
                Organization
                <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                  <option value="new">Name a new organization</option>
                </select>
              </label>
              {creatingOrg && (
                <>
                  <label className="field">
                    Organization name
                    <input value={orgName} onChange={(event) => setOrgName(event.target.value)} required minLength={2} />
                  </label>
                  <label className="field">
                    Type
                    <select value={orgType} onChange={(event) => setOrgType(event.target.value as typeof orgType)}>
                      {ORG_TYPES.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          )}

          <label className="field" style={{ marginTop: 16 }}>
            What should the conversation cover?
            <textarea
              rows={3}
              value={topic}
              minLength={8}
              required
              placeholder="The measurement, who is observed, and what you need back."
              onChange={(event) => setTopic(event.target.value)}
            />
          </label>
          <label className="field">
            Notes for the team
            <textarea
              rows={2}
              value={notes}
              maxLength={1000}
              placeholder="Optional. Leave out participant names and health records."
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>

          <div className="section-row">
            <h2>Open times</h2>
          </div>
          {days.length === 0 ? (
            <div className="empty">
              <h3>No open time in the next two weeks.</h3>
              <p>Weekday slots from 9:00 to 4:30 Central appear here when they are free.</p>
            </div>
          ) : (
            <>
              <div className="filters wrap" role="tablist" aria-label="Day">
                {days.map(([key, slot]) => (
                  <button
                    key={key}
                    type="button"
                    className={day === key ? "on" : ""}
                    onClick={() => {
                      setDay(key);
                      setStartsAt("");
                    }}
                  >
                    {chicagoDayLabel(slot.starts_at)}
                  </button>
                ))}
              </div>
              <div className="consult-slots" role="listbox" aria-label="Times">
                {times.map((slot) => (
                  <button
                    key={slot.starts_at}
                    type="button"
                    className={`slot-btn ${startsAt === slot.starts_at ? "on" : ""}`}
                    aria-pressed={startsAt === slot.starts_at}
                    onClick={() => setStartsAt(slot.starts_at)}
                  >
                    {formatSlotRange(slot.starts_at).split(" · ")[1]}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="form-actions">
            <button className="btn solid" type="submit" disabled={!canBook || busy}>
              {busy ? "Saving…" : "Book this time"}
            </button>
          </div>
        </form>
      )}

      <div className="section-row" style={{ marginTop: 28 }}>
        <h2>Your appointments</h2>
      </div>
      {appointments.length === 0 ? (
        <p className="settings-note">None yet. A booked slot stays with your account.</p>
      ) : (
        appointments.map((appointment) => (
          <article className="appt" key={appointment.id}>
            <div className="ticket-no">{formatSlotRange(appointment.starts_at)}</div>
            <div>
              <h3>{appointment.topic}</h3>
              <p>
                {appointment.party === "organization"
                  ? appointment.organization_name || "Organization"
                  : "Personal"}
                {" · "}
                {appointment.status === "scheduled" ? "Scheduled" : "Cancelled"}
              </p>
              {appointment.notes && <p>{appointment.notes}</p>}
            </div>
            {appointment.status === "scheduled" && new Date(appointment.starts_at).getTime() > now && (
              <button className="btn line" type="button" disabled={busy} onClick={() => cancel(appointment)}>
                Cancel
              </button>
            )}
          </article>
        ))
      )}
    </section>
  );
}
