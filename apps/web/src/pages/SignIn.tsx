import { Mail } from "lucide-react";
import { type FormEvent, useState } from "react";
import { api } from "../api";
import { ErrorBanner, Mark } from "../components/bits";
import { useConfig } from "../hooks";

export function SignIn() {
  const config = useConfig();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const social = (config.data?.providers ?? []).filter(
    (p): p is "google" | "microsoft" => p === "google" || p === "microsoft",
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api.sendMagicLink(email.trim());
      setSentTo(email.trim());
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="signin">
      <div className="signin-band">
        <div className="shell-bar-inner">
          <span className="wordmark">
            <Mark />
            Applied
          </span>
        </div>
      </div>
      <main className="signin-body">
        <div className="signin-card">
          {sentTo ? (
            <>
              <div>
                <h1>Check your inbox</h1>
                <p className="lede">
                  We sent a sign-in link to <strong>{sentTo}</strong>. It works for 15 minutes.
                </p>
              </div>
              {import.meta.env.DEV && (
                <p className="dev-hint">
                  Running locally: the link is printed in the wrangler dev console.
                </p>
              )}
              <button type="button" className="btn" onClick={() => setSentTo(null)}>
                Use a different email
              </button>
            </>
          ) : (
            <>
              <div>
                <h1>Sign in to Applied</h1>
                <p className="lede">We'll email you a link. No password to remember.</p>
              </div>
              <form onSubmit={submit} style={{ display: "grid", gap: "0.9rem" }}>
                <label className="field">
                  <span className="field-label">Email</span>
                  <input
                    className="input"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </label>
                {error !== null && <ErrorBanner error={error} />}
                <button type="submit" className="btn btn-primary" disabled={pending}>
                  <Mail />
                  {pending ? "Sending…" : "Email me a sign-in link"}
                </button>
              </form>
              {social.length > 0 && (
                <>
                  <div className="divider">or</div>
                  {social.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className="btn"
                      onClick={async () => {
                        try {
                          const { url } = await api.socialSignIn(p);
                          window.location.assign(url);
                        } catch (err) {
                          setError(err);
                        }
                      }}
                    >
                      Continue with {p === "google" ? "Google" : "Microsoft"}
                    </button>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
