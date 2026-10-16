import { describe, expect, it } from "vitest";
import { normalizeCompany, normalizeReqNumber, normalizeTitle, titleSimilarity } from "./normalize";

describe("normalizeCompany", () => {
  it.each([
    ["Stripe, Inc.", "stripe"],
    ["STRIPE", "stripe"],
    ["The Home Depot", "home depot"],
    ["Procter & Gamble Co.", "procter and gamble"],
    ["Société Générale S.A.", "societe generale"],
    ["Acme Holdings LLC", "acme holdings"],
    ["Co", "co"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeCompany(input)).toBe(expected);
  });
});

describe("normalizeTitle", () => {
  it.each([
    ["Sr. SWE (Remote)", "senior software engineer"],
    ["Software Engineer II", "software engineer 2"],
    ["Full-Time Product Manager", "product manager"],
    ["Staff ML Eng", "staff machine learning engineer"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeTitle(input)).toBe(expected);
  });
});

describe("titleSimilarity", () => {
  it("is 1 for equivalent titles", () => {
    expect(titleSimilarity("Staff SWE", "Staff Software Engineer")).toBe(1);
  });

  it("is partial for overlapping titles", () => {
    const s = titleSimilarity("Software Engineer, Payments", "Software Engineer");
    expect(s).toBeGreaterThan(0.6);
    expect(s).toBeLessThan(1);
  });

  it("is 0 for unrelated titles or empty input", () => {
    expect(titleSimilarity("Data Analyst", "Product Designer")).toBe(0);
    expect(titleSimilarity("", "Engineer")).toBe(0);
  });
});

describe("normalizeReqNumber", () => {
  it("ignores case and punctuation", () => {
    expect(normalizeReqNumber("R-1234")).toBe(normalizeReqNumber("r1234"));
  });
});
