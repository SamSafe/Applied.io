import { useQueryClient } from "@tanstack/react-query";
import { Check, LogOut } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { api, type User } from "../api";
import { ErrorBanner } from "../components/bits";
import { ForwardingSection, RecentEmailsSection } from "../components/Forwarding";
import { Section } from "../components/Section";
import { useSettings, useUpdateSettings } from "../hooks";

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
      <GhostingSection />
      <TimeZoneSection />
      <AccountSection user={user} />
    </div>
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
  return (
    <Section title="Account" lede="You sign in with a link sent to this address.">
      <p>{user.email}</p>
      <div>
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
      </div>
    </Section>
  );
}
