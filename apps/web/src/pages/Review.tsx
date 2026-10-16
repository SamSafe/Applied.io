import { Check } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "wouter";
import type { Proposal, ReviewCandidate, ReviewItem } from "../api";
import { ErrorBanner, StageChip } from "../components/bits";
import { formatDate, OUTCOME_COLOR, OUTCOME_LABEL, STAGE_COLOR, STAGE_LABEL } from "../format";
import { useApplications, useResolveReview, useReview, useTimeZone } from "../hooks";

const CATEGORY: Record<string, string> = {
  application_received: "Application received",
  assessment: "Assessment invite",
  interview_invite: "Interview invite",
  interview_logistics: "Interview details",
  rejection: "Rejection",
  offer: "Offer",
  withdrawal_ack: "Withdrawal confirmed",
  recruiter_outreach: "Recruiter outreach",
  other: "Not job-related",
};

const KIND: Record<string, string> = {
  recruiter_screen: "recruiter screen",
  interview: "interview",
  final_round: "final round",
};

const CERTAINTY: Record<string, string> = { high: "sure", medium: "fairly sure", low: "unsure" };

export function ReviewPage() {
  const review = useReview();

  return (
    <div className="review">
      <div className="page-head">
        <div>
          <h1 className="page-title">Review</h1>
          <p className="page-sub">
            Emails Applied wasn't sure about. Nothing changes until you decide.
          </p>
        </div>
      </div>
      {review.error && <ErrorBanner error={review.error} onRetry={() => review.refetch()} />}
      {review.data && review.data.length === 0 && (
        <div className="board">
          <div className="empty">
            <h2>Nothing to review</h2>
            <p>
              When Applied isn't sure what an email means or which application it belongs to, it
              waits here instead of guessing.
            </p>
            <Link href="/" className="btn btn-small">
              Back to the pipeline
            </Link>
          </div>
        </div>
      )}
      <div className="review-list">
        {review.data?.map((item) => (
          <ReviewCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function ReviewCard({ item }: { item: ReviewItem }) {
  const timeZone = useTimeZone();
  const resolve = useResolveReview();
  const mode = item.suggestion?.kind ?? "create";
  const step = stepLabel(item.proposal);
  const what = [
    item.category ? CATEGORY[item.category] : null,
    item.interviewKind ? KIND[item.interviewKind] : null,
  ]
    .filter(Boolean)
    .join(", ");
  const about = [item.company, item.position].filter(Boolean).join(" · ");

  return (
    <article className="review-card" aria-labelledby={`review-${item.id}`}>
      <header className="review-head">
        <h2 id={`review-${item.id}`} className="review-subject">
          {item.subject || "(no subject)"}
        </h2>
        <span className="review-when num">
          {formatDate(item.sentAt ?? item.receivedAt, timeZone)}
        </span>
      </header>
      <p className="review-from">
        {item.from}
        {!item.senderVerified && (
          <span className="field-hint"> · not verified as coming through your mailbox</span>
        )}
      </p>

      <dl className="review-facts">
        <dt>Says</dt>
        <dd>
          <strong>{what || "Unclear"}</strong>
          {about && <> · {about}</>}
          {item.certainty && (
            <span className="field-hint"> · classifier {CERTAINTY[item.certainty]}</span>
          )}
        </dd>
        {step && (
          <>
            <dt>Would record</dt>
            <dd>{step}</dd>
          </>
        )}
        {item.reasons.length > 0 && (
          <>
            <dt>Waiting because</dt>
            <dd>{item.reasons.join(" ")}</dd>
          </>
        )}
      </dl>

      {item.evidence && <blockquote className="evidence">“{item.evidence}”</blockquote>}

      {resolve.error && <ErrorBanner error={resolve.error} />}
      {mode === "append" || mode === "pick" ? (
        <ChooseApplication
          item={item}
          onResolve={(action) => resolve.mutate({ id: item.id, action })}
          pending={resolve.isPending}
        />
      ) : (
        <CreateApplication
          item={item}
          label={
            mode === "create_and_append" && step
              ? `Create it and record “${step}”`
              : "Create application"
          }
          onResolve={(action) => resolve.mutate({ id: item.id, action })}
          pending={resolve.isPending}
        />
      )}
    </article>
  );
}

type Resolve = (
  action: Parameters<ReturnType<typeof useResolveReview>["mutate"]>[0]["action"],
) => void;

function CreateApplication({
  item,
  label,
  onResolve,
  pending,
}: {
  item: ReviewItem;
  label: string;
  onResolve: Resolve;
  pending: boolean;
}) {
  const [choosing, setChoosing] = useState(false);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    onResolve({
      action: "create",
      company: String(f.get("company") ?? "").trim(),
      position: String(f.get("position") ?? "").trim(),
    });
  };

  if (choosing)
    return (
      <ChooseApplication
        item={item}
        onResolve={onResolve}
        pending={pending}
        onCancel={() => setChoosing(false)}
      />
    );

  return (
    <form className="review-actions" onSubmit={submit}>
      <div className="form-row">
        <label className="field">
          <span className="field-label">Company</span>
          <input className="input" name="company" required defaultValue={item.company ?? ""} />
        </label>
        <label className="field">
          <span className="field-label">Role</span>
          <input className="input" name="position" required defaultValue={item.position ?? ""} />
        </label>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {label}
        </button>
        <button type="button" className="btn" onClick={() => setChoosing(true)}>
          It's an application I already have
        </button>
        <span className="spacer" />
        <button
          type="button"
          className="btn btn-quiet"
          disabled={pending}
          onClick={() => onResolve({ action: "ignore" })}
        >
          Ignore
        </button>
      </div>
    </form>
  );
}

function ChooseApplication({
  item,
  onResolve,
  pending,
  onCancel,
}: {
  item: ReviewItem;
  onResolve: Resolve;
  pending: boolean;
  onCancel?: () => void;
}) {
  const all = useApplications("all", "");
  const suggested = item.candidates;
  const others = (all.data?.applications ?? []).filter(
    (a) => !suggested.some((s) => s.applicationId === a.id),
  );
  const [chosen, setChosen] = useState<string>(suggested[0]?.applicationId ?? "");

  return (
    <div className="review-actions">
      {suggested.length > 0 && (
        <fieldset className="choices">
          <legend className="field-label">
            {suggested.length === 1 ? "Looks like" : "Which one?"}
          </legend>
          {suggested.map((c) => (
            <label key={c.applicationId} className="choice">
              <input
                type="radio"
                name={`app-${item.id}`}
                value={c.applicationId}
                checked={chosen === c.applicationId}
                onChange={() => setChosen(c.applicationId)}
              />
              <span className="choice-text">
                <strong>{c.company}</strong> · {c.position}
              </span>
              <StageChip chip={candidateChip(c)} />
            </label>
          ))}
        </fieldset>
      )}
      <label className="field">
        <span className="field-label">
          {suggested.length > 0 ? "Or another application" : "Which application?"}
        </span>
        <select
          className="select"
          value={suggested.some((s) => s.applicationId === chosen) ? "" : chosen}
          onChange={(e) => setChosen(e.target.value)}
        >
          <option value="">Choose…</option>
          {others.map((a) => (
            <option key={a.id} value={a.id}>
              {a.company} · {a.position}
            </option>
          ))}
        </select>
      </label>
      <div className="form-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || !chosen}
          onClick={() => onResolve({ action: "assign", applicationId: chosen })}
        >
          <Check />
          {item.proposal?.kind === "create" ? "Same application" : "Record on this application"}
        </button>
        {onCancel ? (
          <button type="button" className="btn" onClick={onCancel}>
            Create a new one instead
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() => onResolve({ action: "create" })}
          >
            Create a new application
          </button>
        )}
        <span className="spacer" />
        <button
          type="button"
          className="btn btn-quiet"
          disabled={pending}
          onClick={() => onResolve({ action: "ignore" })}
        >
          Ignore
        </button>
      </div>
    </div>
  );
}

function stepLabel(p: Proposal | null): string | null {
  if (!p) return null;
  if (p.kind === "advance") return `Moved to ${STAGE_LABEL[p.stage].toLowerCase()}`;
  if (p.kind === "close") return OUTCOME_LABEL[p.outcome];
  if (p.kind === "create") return "Applied";
  return null;
}

function candidateChip(c: ReviewCandidate) {
  return c.status.state === "closed"
    ? { label: OUTCOME_LABEL[c.status.outcome], color: OUTCOME_COLOR[c.status.outcome] }
    : { label: STAGE_LABEL[c.maxStage], color: STAGE_COLOR[c.maxStage] };
}
