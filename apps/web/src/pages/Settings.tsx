import { useQueryClient } from "@tanstack/react-query";
import { Check, Download, LogOut, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { api, type User } from "../api";
import { ErrorBanner } from "../components/bits";
import { ForwardingSection, RecentEmailsSection } from "../components/Forwarding";
import { Section } from "../components/Section";
import { useDeleteAccount, useSettings, useUpdateSettings } from "../hooks";

export function SettingsPage({ user }: { user: User }) {
  // Deep links like /settings#forwarding: scroll once the section has rendered.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <div className="settings">
      <div className="page-head">
        <h1 className="page-title">Settings</h1>
      </div>
      <ForwardingSection />
      <RecentEmailsSection />
      <AutomaticUpdatesSection />
      <GhostingSection />
      <TimeZoneSection />
      <AccountSection user={user} />
    </div>
  );
}

function AutomaticUpdatesSection() {
  const { data: settings } = useSettings();
  const update = useUpdateSettings();

  return (
    <Section
      title="Automatic updates"
      lede="When an email is clearly news about one of your applications, Applied records it for you."
    >
      {settings && (
        <>
          <label className="choice">
            <input
              type="checkbox"
              checked={settings.autoApply}
              disabled={update.isPending}
              onChange={(e) => update.mutate({ autoApply: e.target.checked })}
            />
            <span className="choice-text">Update applications from email automatically</span>
          </label>
          <p className="field-hint">
            {settings.autoApply
              ? "Only verified, unambiguous news is applied on its own. Anything less certain waits in Review, and every update can be undone."
              : "Every email that looks like news waits in Review for you to confirm."}
          </p>
        </>
      )}
      {update.error && <ErrorBanner error={update.error} />}
    </Section>
  );
}

function GhostingSection() {
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  const [saved, setSaved] = useState(false);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const days = Number(new FormData(e.currentTarget).get("days"));
    update.mutate(
      { ghostThresholdDays: days },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 1800);
        },
      },
    );
  };

  return (
    <Section
      title="Ghosting"
      lede="An open application with no news for this long counts as ghosted. It un-ghosts the moment news arrives."
    >
      {settings && (
        <form className="inline-form" onSubmit={submit}>
          <label className="field">
            <span className="field-label">Days without news</span>
            <input
              className="input num"
              name="days"
              type="number"
              min={1}
              max={365}
              required
              defaultValue={settings.ghostThresholdDays}
              style={{ width: 120 }}
            />
          </label>
          <button type="submit" className="btn" disabled={update.isPending}>
            {saved ? <Check /> : null}
            {saved ? "Saved" : "Save"}
          </button>
        </form>
      )}
      {update.error && <ErrorBanner error={update.error} />}
    </Section>
  );
}

function TimeZoneSection() {
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  const zones = useMemo(() => Intl.supportedValuesOf("timeZone"), []);
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <Section title="Time zone" lede="Dates throughout Applied are shown in this time zone.">
      {settings && (
        <label className="field" style={{ maxWidth: 320 }}>
          <span className="field-label">Time zone</span>
          <select
            className="select"
            value={settings.timezone ?? ""}
            disabled={update.isPending}
            onChange={(e) => update.mutate({ timezone: e.target.value || null })}
          >
            <option value="">This device ({browserZone.replaceAll("_", " ")})</option>
            {[...new Set(["UTC", ...zones])].map((z) => (
              <option key={z} value={z}>
                {z.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
      )}
      {update.error && <ErrorBanner error={update.error} />}
    </Section>
  );
}

function AccountSection({ user }: { user: User }) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const remove = useDeleteAccount();
  const [confirming, setConfirming] = useState(false);

  return (
    <Section title="Account" lede="You sign in with a link sent to this address.">
      <p>{user.email}</p>
      <div className="form-actions">
        <a className="btn" href={api.exportUrl} download>
          <Download />
          Download my data
        </a>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            await api.signOut();
            qc.clear();
            navigate("/sign-in");
          }}
        >
          <LogOut />
          Sign out
        </button>
        <span className="spacer" />
        {!confirming && (
          <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)}>
            <Trash2 />
            Delete account
          </button>
        )}
      </div>
      {confirming && (
        <div className="confirm" role="alert">
          <p>
            Delete your account, applications and stored emails? This can't be undone. Download your
            data first if you want a copy.
          </p>
          <button
            type="button"
            className="btn btn-small btn-quiet"
            onClick={() => setConfirming(false)}
          >
            Keep my account
          </button>
          <button
            type="button"
            className="btn btn-small btn-danger-solid"
            disabled={remove.isPending}
            onClick={() => remove.mutate(undefined, { onSuccess: () => navigate("/sign-in") })}
          >
            {remove.isPending ? "Deleting…" : "Delete everything"}
          </button>
        </div>
      )}
      {remove.error && <ErrorBanner error={remove.error} />}
    </Section>
  );
}
