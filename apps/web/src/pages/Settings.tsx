import { useQueryClient } from "@tanstack/react-query";
import { Check, Inbox, LogOut, RefreshCw } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { api, type MailSource, type User } from "../api";
import { CopyButton, ErrorBanner } from "../components/bits";
import { ago } from "../format";
import {
  useCreateForwarding,
  useMailSources,
  useRotateForwarding,
  useSettings,
  useUpdateSettings,
} from "../hooks";

export function SettingsPage({ user }: { user: User }) {
  return (
    <div className="settings">
      <div className="page-head">
        <h1 className="page-title">Settings</h1>
      </div>
      <ForwardingSection />
      <GhostingSection />
      <TimeZoneSection />
      <AccountSection user={user} />
    </div>
  );
}

function Section({
  title,
  lede,
  children,
}: {
  title: string;
  lede: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-section">
      <div>
        <h2>{title}</h2>
        <p className="lede">{lede}</p>
      </div>
      <div className="settings-body">{children}</div>
    </section>
  );
}

function ForwardingSection() {
  const sources = useMailSources();
  const create = useCreateForwarding();
  const forwarding =
    sources.data?.filter((s) => s.kind === "forwarding" && s.status !== "revoked") ?? [];

  return (
    <Section
      title="Forwarding address"
      lede="Forward job emails here, or point an email filter at it, and they'll update your pipeline."
    >
      {sources.error && <ErrorBanner error={sources.error} onRetry={() => sources.refetch()} />}
      {forwarding.map((s) => (
        <ForwardingAddress key={s.id} source={s} />
      ))}
      {sources.data && forwarding.length === 0 && (
        <div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            <Inbox />
            Get my forwarding address
          </button>
        </div>
      )}
      <p className="field-hint">
        Emails you forward are stored now. Reading them to update applications automatically is the
        next feature to launch.
      </p>
    </Section>
  );
}

function ForwardingAddress({ source }: { source: MailSource }) {
  const rotate = useRotateForwarding();
  const [confirming, setConfirming] = useState(false);
  if (!source.address) return null;

  return (
    <div style={{ display: "grid", gap: "0.6rem" }}>
      <div className="address">
        <code>{source.address}</code>
        <CopyButton text={source.address} />
      </div>
      <span className="status-note">
        {source.status === "active" && source.lastMessageAt ? (
          <>
            <Check width={15} height={15} aria-hidden="true" />
            Receiving · last email {ago(source.lastMessageAt)}
          </>
        ) : (
          "Waiting for the first email"
        )}
      </span>
      {confirming ? (
        <div className="confirm" role="alert">
          <p>
            Mail sent to the current address will be rejected. Update your email filter afterwards.
          </p>
          <button
            type="button"
            className="btn btn-small btn-quiet"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-small btn-danger-solid"
            disabled={rotate.isPending}
            onClick={() => rotate.mutate(source.id, { onSuccess: () => setConfirming(false) })}
          >
            Replace address
          </button>
        </div>
      ) : (
        <div>
          <button type="button" className="btn btn-small" onClick={() => setConfirming(true)}>
            <RefreshCw />
            Get a new address
          </button>
        </div>
      )}
      {rotate.error && <ErrorBanner error={rotate.error} />}
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
