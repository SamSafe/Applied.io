import { useEffect, useState } from "react";

/** Placeholder shell until M2 builds the tracker UI. Confirms the SPA can reach the API. */
export function App() {
  const [api, setApi] = useState<"checking" | "ok" | "down">("checking");

  useEffect(() => {
    fetch("/api/health")
      .then((res) => setApi(res.ok ? "ok" : "down"))
      .catch(() => setApi("down"));
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>Applied</h1>
      <p>Apply anywhere. Your tracker updates itself.</p>
      <p>API: {api}</p>
    </main>
  );
}
