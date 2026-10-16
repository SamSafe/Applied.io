import { type AdvanceStage, type Outcome, STAGES } from "@apptracker/core";
import { ArrowLeft, ExternalLink, Pencil, Trash2, X } from "lucide-react";
import { type CSSProperties, type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import type { Detail, HistoryEvent, StepInput } from "../api";
import { ErrorBanner, StageChip } from "../components/bits";
import { ownScale, TrackBar } from "../components/TrackBar";
import {
  dateInputValue,
  daysBetween,
  formatDate,
  formatDateTime,
  OUTCOME_COLOR,
  OUTCOME_LABEL,
  reference,
  STAGE_COLOR,
  STAGE_LABEL,
  statusChip,
} from "../format";
import {
  useAddStep,
  useApplication,
  useDeleteApplication,
  useMarkSeen,
  useTimeZone,
  useUndo,
  useUpdateApplication,
} from "../hooks";

export function DetailPanel({ id, closeHref }: { id: string; closeHref: string }) {
  const { data: app, error, refetch } = useApplication(id);
  const markSeen = useMarkSeen();
  const [editing, setEditing] = useState(false);

  // Opening an application is what "seeing" its news means. The panel keeps showing which
  // steps were new for this visit; the list stops flagging them.
  const seenFor = useRef<string | null>(null);
  useEffect(() => {
    if (app && app.updates > 0 && seenFor.current !== app.id) {
      seenFor.current = app.id;
      markSeen.mutate(app.id);
    }
  }, [app, markSeen]);

  return (
    <aside className="panel" aria-label={app ? `${app.company}, ${app.position}` : "Application"}>
      <div className="panel-top">
        <Link href={closeHref} className="btn btn-small btn-quiet back-link">
          <ArrowLeft />
          Pipeline
        </Link>
        {app && <span className="ref num">Ref {reference(app.id)}</span>}
        <Link href={closeHref} className="btn btn-icon btn-quiet" aria-label="Close">
          <X />
        </Link>
      </div>
      {error ? (
        <div className="panel-section">
          <ErrorBanner error={error} onRetry={() => refetch()} />
        </div>
      ) : !app ? (
        <PanelSkeleton />
      ) : editing ? (
        <EditFacts app={app} onDone={() => setEditing(false)} />
      ) : (
        <>
          <LabelHead app={app} onEdit={() => setEditing(true)} />
          <hr className="perforation" />
          <StatusSection app={app} />
          <History app={app} />
        </>
      )}
    </aside>
  );
}

function LabelHead({ app, onEdit }: { app: Detail; onEdit: () => void }) {
  const timeZone = useTimeZone();
  const rows: [string, React.ReactNode][] = [
    ["Applied", formatDate(app.appliedAt, timeZone)],
    ...(app.location ? [["Location", app.location] as [string, string]] : []),
    ...(app.source ? [["Source", app.source] as [string, string]] : []),
    ...(app.reqNumber ? [["Req.", app.reqNumber] as [string, string]] : []),
    ...(app.url
      ? [
          [
            "Posting",
            <a key="url" href={app.url} target="_blank" rel="noreferrer">
              {new URL(app.url).hostname.replace(/^www\./, "")}
              <ExternalLink
                width={13}
                height={13}
                style={{ marginLeft: 4, verticalAlign: "-1px" }}
              />
            </a>,
          ] as [string, React.ReactNode],
        ]
      : []),
  ];

  return (
    <div className="label-head">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "0.75rem",
          alignItems: "start",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2 className="label-company">{app.company}</h2>
          <p className="label-role">{app.position}</p>
        </div>
        <button type="button" className="btn btn-small" onClick={onEdit}>
          <Pencil />
          Edit
        </button>
      </div>
      <dl className="label-meta num">
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {app.notes && <p className="history-note">{app.notes}</p>}
    </div>
  );
}

function StatusSection({ app }: { app: Detail }) {
  const timeZone = useTimeZone();
  const now = Date.now();
  const scale = ownScale(app, now);
  const silentDays = daysBetween(app.lastActivityAt, now);
  const when =
    app.status.state === "closed"
      ? `Closed ${formatDate(app.status.closedAt, timeZone)}`
      : app.isStale
        ? `No news for ${silentDays} days`
        : silentDays <= 0
          ? "Last news today"
          : `Last news ${silentDays === 1 ? "yesterday" : `${silentDays} days ago`}`;

  return (
    <section className="panel-section" aria-labelledby="status-title">
      <h3 id="status-title" className="visually-hidden">
        Status
      </h3>
      <div className="status-line">
        <StageChip chip={statusChip(app)} large />
        <span className="status-when num">{when}</span>
      </div>
      <TrackBar app={app} scale={scale} now={now} large />
      <div className="track-ends num" aria-hidden="true">
        <span>{formatDate(app.appliedAt, timeZone)}</span>
        <span>
          {app.status.state === "closed" ? formatDate(app.status.closedAt, timeZone) : "Today"}
        </span>
      </div>
      <StepActions app={app} />
    </section>
  );
}

type Draft =
  | { kind: "advance"; stage: AdvanceStage }
  | { kind: "close"; outcome: Outcome }
  | { kind: "note" };

const NEXT_STAGES = STAGES.filter((s): s is AdvanceStage => s !== "applied");

function StepActions({ app }: { app: Detail }) {
  const timeZone = useTimeZone();
  const addStep = useAddStep(app.id);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [date, setDate] = useState(() => dateInputValue(timeZone));
  const [note, setNote] = useState("");
  const open = app.status.state === "open";
  const offerReached = app.maxStage === "offer";
  const nextStage = NEXT_STAGES.find((s) => STAGES.indexOf(s) > STAGES.indexOf(app.maxStage));

  const start = (d: Draft) => {
    addStep.reset();
    setDraft(d);
    setDate(dateInputValue(timeZone));
    setNote("");
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const base = { occurredAt: date, ...(note.trim() ? { note: note.trim() } : {}) };
    const step: StepInput =
      draft.kind === "advance"
        ? { type: "advanced", stage: draft.stage, ...base }
        : draft.kind === "close"
          ? { type: "closed", outcome: draft.outcome, ...base }
          : { type: "noted", occurredAt: date, note: note.trim() };
    addStep.mutate(step, { onSuccess: () => setDraft(null) });
  };

  const title =
    draft?.kind === "advance"
      ? "Record a new stage"
      : draft?.kind === "close"
        ? `Mark as ${OUTCOME_LABEL[draft.outcome].toLowerCase()}`
        : "Add a note";

  return (
    <div style={{ marginTop: "1.1rem" }}>
      <div className="actions">
        {open && nextStage && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => start({ kind: "advance", stage: nextStage })}
          >
            Moved to {STAGE_LABEL[nextStage].toLowerCase()}…
          </button>
        )}
        {open && offerReached && (
          <>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => start({ kind: "close", outcome: "accepted" })}
            >
              Accepted the offer
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => start({ kind: "close", outcome: "declined" })}
            >
              Declined
            </button>
          </>
        )}
        {open && (
          <>
            <button
              type="button"
              className="btn"
              onClick={() => start({ kind: "close", outcome: "rejected" })}
            >
              Rejected
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => start({ kind: "close", outcome: "withdrawn" })}
            >
              Withdrew
            </button>
          </>
        )}
        <button type="button" className="btn btn-quiet" onClick={() => start({ kind: "note" })}>
          Add note
        </button>
      </div>
      {!open && (
        <p className="field-hint" style={{ marginTop: "0.6rem" }}>
          This application is closed. Undo the closing step below to reopen it.
        </p>
      )}
      {draft && (
        <form className="step-form" onSubmit={submit} aria-label={title}>
          <strong>{title}</strong>
          <div className="form-row">
            {draft.kind === "advance" && (
              <label className="field">
                <span className="field-label">Stage</span>
                <select
                  className="select"
                  value={draft.stage}
                  onChange={(e) =>
                    setDraft({ kind: "advance", stage: e.target.value as AdvanceStage })
                  }
                >
                  {NEXT_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              <span className="field-label">Date</span>
              <input
                className="input num"
                type="date"
                value={date}
                max={dateInputValue(timeZone)}
                required
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>
          <label className="field">
            <span className="field-label">
              {draft.kind === "note" ? "Note" : "Note (optional)"}
            </span>
            <textarea
              className="textarea"
              value={note}
              required={draft.kind === "note"}
              placeholder={
                draft.kind === "note" ? "e.g. Recruiter said to expect news next week" : ""
              }
              onChange={(e) => setNote(e.target.value)}
              // biome-ignore lint/a11y/noAutofocus: the form opens in response to this action
              autoFocus={draft.kind === "note"}
            />
          </label>
          {addStep.error && <ErrorBanner error={addStep.error} />}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={addStep.isPending}>
              {addStep.isPending ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function History({ app }: { app: Detail }) {
  const timeZone = useTimeZone();
  const undo = useUndo();
  const shown = app.events.filter((e) => e.type !== "voided").reverse();
  const undoneAt = new Map(
    app.events.flatMap((e) =>
      e.type === "voided" && e.voidsEventId ? [[e.voidsEventId, e.occurredAt]] : [],
    ),
  );

  // Animate steps that arrived while the panel was open (the "stamp").
  const known = useRef<Set<string> | null>(null);
  const fresh = known.current
    ? new Set(shown.filter((e) => !known.current?.has(e.id)).map((e) => e.id))
    : new Set();
  useEffect(() => {
    known.current = new Set(shown.map((e) => e.id));
  });

  return (
    <section className="panel-section" aria-labelledby="history-title">
      <h3 id="history-title" className="section-title">
        History
      </h3>
      {undo.error && (
        <div style={{ marginBottom: "0.75rem" }}>
          <ErrorBanner error={undo.error} />
        </div>
      )}
      <ol className="history">
        {shown.map((e) => {
          const undone = undoneAt.get(e.id);
          return (
            <li
              key={e.id}
              className={`history-item${e.voided ? " is-voided" : ""}${fresh.has(e.id) ? " just-added" : ""}`}
            >
              <span
                className={nodeClass(e)}
                style={{ "--node-color": nodeColor(e) } as CSSProperties}
              />
              <div>
                <div className="history-title">
                  {eventTitle(e)}
                  {e.unseen && !e.voided && <span className="new-pill">New</span>}
                </div>
                <div className="history-meta num">
                  {formatDateTime(e.occurredAt, timeZone)} ·{" "}
                  {e.origin === "email" ? "from an email" : "added by you"}
                  {undone && ` · undone ${formatDate(undone, timeZone)}`}
                </div>
                {e.note && <p className="history-note">{e.note}</p>}
                {e.emails.map((m) => (
                  <div key={`${m.subject}-${m.sentAt}`} className="history-email">
                    <span className="history-email-subject">{m.subject || "(no subject)"}</span>
                    {m.evidence && <blockquote className="evidence">“{m.evidence}”</blockquote>}
                  </div>
                ))}
              </div>
              {e.type !== "applied" && !e.voided && (
                <button
                  type="button"
                  className="btn btn-small btn-quiet undo"
                  disabled={undo.isPending}
                  aria-label={`Undo: ${eventTitle(e)}`}
                  onClick={() => undo.mutate(e.id)}
                >
                  Undo
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function eventTitle(e: HistoryEvent): string {
  switch (e.type) {
    case "applied":
      return "Applied";
    case "advanced":
      return `Moved to ${e.stage ? STAGE_LABEL[e.stage].toLowerCase() : "next stage"}`;
    case "closed":
      return e.outcome === "accepted"
        ? "Accepted the offer"
        : e.outcome === "declined"
          ? "Declined the offer"
          : e.outcome === "withdrawn"
            ? "Withdrew"
            : "Rejected";
    case "noted":
      return "Note";
    default:
      return "Undo";
  }
}

function nodeClass(e: HistoryEvent): string {
  if (e.unseen && !e.voided) return "history-node is-unseen";
  if (e.type === "applied") return "history-node is-applied";
  if (e.type === "noted") return "history-node is-note";
  return "history-node";
}

function nodeColor(e: HistoryEvent): string {
  if (e.type === "advanced" && e.stage) return STAGE_COLOR[e.stage];
  if (e.type === "closed" && e.outcome) return OUTCOME_COLOR[e.outcome];
  return STAGE_COLOR.applied;
}

function EditFacts({ app, onDone }: { app: Detail; onDone: () => void }) {
  const update = useUpdateApplication(app.id);
  const remove = useDeleteApplication();
  const [, navigate] = useLocation();
  const [confirming, setConfirming] = useState(false);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "");
    update.mutate(
      {
        company: text("company"),
        position: text("position"),
        location: text("location"),
        url: text("url"),
        source: text("source"),
        reqNumber: text("reqNumber"),
        notes: text("notes"),
      },
      { onSuccess: onDone },
    );
  };

  return (
    <form className="panel-section" onSubmit={submit} style={{ display: "grid", gap: "0.9rem" }}>
      <h2 className="section-title" style={{ fontSize: "1.2rem", marginBottom: 0 }}>
        Edit details
      </h2>
      <FactsFields app={app} />
      {update.error && <ErrorBanner error={update.error} />}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save changes"}
        </button>
        <button type="button" className="btn btn-quiet" onClick={onDone}>
          Cancel
        </button>
        <span className="spacer" />
        {!confirming && (
          <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)}>
            <Trash2 />
            Delete
          </button>
        )}
      </div>
      {confirming && (
        <div className="confirm" role="alert">
          <p>Delete this application and its whole history? This can't be undone.</p>
          <button
            type="button"
            className="btn btn-small btn-quiet"
            onClick={() => setConfirming(false)}
          >
            Keep it
          </button>
          <button
            type="button"
            className="btn btn-small btn-danger-solid"
            disabled={remove.isPending}
            onClick={() => remove.mutate(app.id, { onSuccess: () => navigate("/") })}
          >
            Delete application
          </button>
        </div>
      )}
    </form>
  );
}

/** Shared by Edit and Add. Field names match the API's facts. */
export function FactsFields({ app }: { app?: Partial<Detail> }) {
  return (
    <>
      <div className="form-row">
        <label className="field">
          <span className="field-label">Company</span>
          <input
            className="input"
            name="company"
            required
            maxLength={200}
            defaultValue={app?.company ?? ""}
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span className="field-label">Role</span>
          <input
            className="input"
            name="position"
            required
            maxLength={200}
            defaultValue={app?.position ?? ""}
            autoComplete="off"
          />
        </label>
      </div>
      <label className="field">
        <span className="field-label">Job posting link</span>
        <input
          className="input"
          name="url"
          type="url"
          maxLength={2000}
          placeholder="https://"
          defaultValue={app?.url ?? ""}
        />
      </label>
      <div className="form-row">
        <label className="field">
          <span className="field-label">Location</span>
          <input
            className="input"
            name="location"
            maxLength={200}
            defaultValue={app?.location ?? ""}
          />
        </label>
        <label className="field">
          <span className="field-label">Found it via</span>
          <input
            className="input"
            name="source"
            list="source-options"
            maxLength={100}
            placeholder="LinkedIn, referral…"
            defaultValue={app?.source ?? ""}
          />
          <datalist id="source-options">
            <option value="LinkedIn" />
            <option value="Company website" />
            <option value="Referral" />
            <option value="Recruiter" />
            <option value="Indeed" />
          </datalist>
        </label>
      </div>
      <label className="field">
        <span className="field-label">Requisition number</span>
        <input
          className="input"
          name="reqNumber"
          maxLength={100}
          defaultValue={app?.reqNumber ?? ""}
        />
      </label>
      <label className="field">
        <span className="field-label">Notes</span>
        <textarea
          className="textarea"
          name="notes"
          maxLength={5000}
          defaultValue={app?.notes ?? ""}
        />
      </label>
    </>
  );
}

function PanelSkeleton() {
  return (
    <div className="label-head" role="status" aria-busy="true">
      <span className="visually-hidden">Loading application</span>
      <span className="skeleton" style={{ display: "block", width: "55%", height: 24 }} />
      <span
        className="skeleton"
        style={{ display: "block", width: "40%", height: 14, marginTop: 10 }}
      />
      <span
        className="skeleton"
        style={{ display: "block", width: "100%", height: 4, marginTop: 28 }}
      />
    </div>
  );
}
