import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { decodeHeader, domainOf, parseAddress, parseEmail, toIso } from "./parse";
import { headerReport } from "./report";

const fixture = (name: string) =>
  readFile(new URL(`../fixtures/public/${name}`, import.meta.url), "utf8");

describe("parseEmail", () => {
  it("extracts the original sender, decoded subject and date of a Gmail auto-forward", async () => {
    const email = await parseEmail(await fixture("gmail-autoforward-greenhouse.eml"));
    expect(email.from).toEqual({
      name: "Acme Recruiting",
      address: "no-reply@us.greenhouse-mail.io",
    });
    expect(email.subject).toBe("Thank you for applying to Acme — Software Engineer");
    expect(email.sentAt).toBe("2026-10-12T21:02:58.000Z");
    expect(email.messageId).toBe("<greenhouse.1234567@us.greenhouse-mail.io>");
    expect(email.text).toContain("Software Engineer role at Acme");
  });
});

describe("headerReport", () => {
  it("sees Gmail's forwarding headers and both DKIM domains", async () => {
    const r = headerReport(await parseEmail(await fixture("gmail-autoforward-greenhouse.eml")));
    expect(r.xForwardedFor).toBe("jane.seeker@gmail.com u_test000001@in.example.test");
    expect(r.xForwardedTo).toBe("u_test000001@in.example.test");
    expect(r.dkimDomains).toEqual(["us.greenhouse-mail.io", "gmail.com"]);
    expect(r.arcAuthenticationResults).toHaveLength(1);
    expect(r.wrapper).toBe("none");
    expect(r.subjectForwardPrefix).toBe(false);
  });

  it("recognizes an Outlook inline forward", async () => {
    const r = headerReport(await parseEmail(await fixture("outlook-manual-forward.eml")));
    expect(r.from).toBe("jane.seeker@outlook.example.test");
    expect(r.subjectForwardPrefix).toBe(true);
    expect(r.wrapper).toBe("inline");
  });

  it("recognizes a message/rfc822 attachment forward", async () => {
    const raw = [
      "From: Jane <jane@example.test>",
      "Subject: Fwd: Interview invitation",
      "MIME-Version: 1.0",
      'Content-Type: multipart/mixed; boundary="b1"',
      "",
      "--b1",
      "Content-Type: text/plain",
      "",
      "See attached.",
      "--b1",
      "Content-Type: message/rfc822",
      "",
      "From: Initech <jobs@initech.example.test>",
      "Subject: Interview invitation",
      "",
      "We'd like to schedule an interview.",
      "--b1--",
      "",
    ].join("\r\n");
    const r = headerReport(await parseEmail(raw));
    expect(r.wrapper).toBe("attachment");
    expect(r.attachmentTypes).toContain("message/rfc822");
  });
});

describe("helpers", () => {
  it("parses address headers", () => {
    expect(parseAddress("Acme Jobs <Jobs@Acme.example>")).toEqual({
      name: "Acme Jobs",
      address: "jobs@acme.example",
    });
    expect(parseAddress(null)).toBeNull();
  });

  it("decodes encoded words", () => {
    expect(decodeHeader("=?UTF-8?Q?Caf=C3=A9?=")).toBe("Café");
  });

  it("takes the domain of an address", () => {
    expect(domainOf("No-Reply@US.Greenhouse-Mail.io")).toBe("us.greenhouse-mail.io");
  });

  it("returns null for bad dates", () => {
    expect(toIso("not a date")).toBeNull();
  });
});
