import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseEmail } from "./parse";
import { prefilter } from "./prefilter";
import { cleanBody } from "./text";
import { unwrap } from "./unwrap";

/** Labels for the synthetic public corpus (fixtures/public/labels.json). */
type Label = {
  relevant: boolean;
  category: string;
  company: string | null;
  position: string | null;
};

const dir = new URL("../fixtures/public/", import.meta.url);
const labels = JSON.parse(await readFile(new URL("labels.json", dir), "utf8")) as Record<
  string,
  Label
>;
const files = (await readdir(dir)).filter((f) => f.endsWith(".eml")).sort();

describe("public corpus", () => {
  it("labels every fixture", () => {
    expect(files.filter((f) => !labels[f])).toEqual([]);
  });

  it.each(files)("prefilter agrees with the label: %s", async (file) => {
    const email = await parseEmail(await readFile(new URL(file, dir)));
    const original = await unwrap(email);
    const result = prefilter({ ...original, body: cleanBody(original.body) });
    expect(result.relevant, result.reason).toBe(labels[file]?.relevant);
  });
});

describe("unwrapping the corpus", () => {
  const load = async (file: string) => unwrap(await parseEmail(await readFile(new URL(file, dir))));

  it("leaves Gmail auto-forwards as they are", async () => {
    const u = await load("lever-received.eml");
    expect(u.wrapper).toBe("none");
    expect(u.from?.address).toBe("no-reply@hire.lever.co");
    expect(u.forwardedBy).toBeNull();
  });

  it("recovers an Outlook inline forward", async () => {
    const u = await load("outlook-manual-forward.eml");
    expect(u).toMatchObject({
      wrapper: "inline",
      from: { name: "Globex Talent", address: "talent@globex.example.test" },
      subject: "Update on your application",
      forwardedBy: { address: "jane.seeker@outlook.example.test" },
    });
    expect(u.sentAt).not.toBeNull();
    expect(u.body).toContain("Unfortunately");
    expect(u.body).not.toContain("Sent:");
  });

  it("recovers an Apple Mail forward and its date", async () => {
    const u = await load("apple-forward.eml");
    expect(u.wrapper).toBe("inline");
    expect(u.from?.address).toBe("alex.chen@lumencivic.example");
    expect(u.sentAt).toBe("2026-10-01T19:12:00.000Z");
  });

  it("opens a message/rfc822 attachment", async () => {
    const u = await load("rfc822-forward.eml");
    expect(u).toMatchObject({
      wrapper: "attachment",
      from: { address: "talent@sablesystems.example" },
      subject: "Interview invitation – Site Reliability Engineer",
      sentAt: "2026-10-14T17:20:00.000Z",
      forwardedBy: { address: "jane.seeker@gmail.com" },
    });
    expect(u.body).toContain("technical interview");
  });

  it("reads HTML-only bodies as text", async () => {
    const u = await load("workday-received.eml");
    expect(u.body).toContain("Software Engineer II, Autonomy position (Job ID: R-10422)");
    expect(u.body).not.toContain("<");
  });
});
