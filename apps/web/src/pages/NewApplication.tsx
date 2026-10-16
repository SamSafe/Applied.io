import { ArrowLeft, X } from "lucide-react";
import type { FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { ErrorBanner } from "../components/bits";
import { dateInputValue } from "../format";
import { useCreateApplication, useTimeZone } from "../hooks";
import { FactsFields } from "./Detail";

export function NewApplicationPanel({ closeHref }: { closeHref: string }) {
  const create = useCreateApplication();
  const timeZone = useTimeZone();
  const [, navigate] = useLocation();
  const today = dateInputValue(timeZone);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim();
    const optional = (k: string) => text(k) || undefined;
    create.mutate(
      {
        company: text("company"),
        position: text("position"),
        appliedAt: text("appliedAt") || undefined,
        url: optional("url"),
        location: optional("location"),
        source: optional("source"),
        reqNumber: optional("reqNumber"),
        notes: optional("notes"),
      },
      { onSuccess: ({ application }) => navigate(`/a/${application.id}`) },
    );
  };

  return (
    <aside className="panel" aria-labelledby="new-title">
      <div className="panel-top">
        <Link href={closeHref} className="btn btn-small btn-quiet back-link">
          <ArrowLeft />
          Pipeline
        </Link>
        <span />
        <Link href={closeHref} className="btn btn-icon btn-quiet" aria-label="Close">
          <X />
        </Link>
      </div>
      <form
        className="panel-section"
        onSubmit={submit}
        style={{ display: "grid", gap: "0.9rem", borderTop: 0 }}
      >
        <div>
          <h2 id="new-title" className="label-company">
            Add an application
          </h2>
          <p className="label-role" style={{ fontSize: "0.93rem" }}>
            For anything that didn't come through your forwarding address.
          </p>
        </div>
        <FactsFields />
        <label className="field">
          <span className="field-label">Date applied</span>
          <input
            className="input num"
            type="date"
            name="appliedAt"
            defaultValue={today}
            max={today}
            required
          />
        </label>
        {create.error && <ErrorBanner error={create.error} />}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={create.isPending}>
            {create.isPending ? "Adding…" : "Add application"}
          </button>
          <Link href={closeHref} className="btn btn-quiet">
            Cancel
          </Link>
        </div>
      </form>
    </aside>
  );
}
