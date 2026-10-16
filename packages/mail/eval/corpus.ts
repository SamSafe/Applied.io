import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import {
  cleanBody,
  type PrefilterResult,
  parseEmail,
  prefilter,
  type Unwrapped,
  unwrap,
} from "../src/index";

export interface Label {
  relevant: boolean;
  category: string;
  interviewKind: string | null;
  company: string | null;
  position: string | null;
}

export interface Sample {
  set: "public" | "private";
  file: string;
  label: Label | undefined;
  original: Unwrapped & { body: string };
  prefilter: PrefilterResult;
}

export const FIXTURES = new URL("../fixtures/", import.meta.url);

export async function readLabels(set: "public" | "private"): Promise<Record<string, Label>> {
  const path = new URL(`${set}/labels.json`, FIXTURES);
  return existsSync(path) ? JSON.parse(await readFile(path, "utf8")) : {};
}

/** Parses, unwraps, cleans and prefilters every .eml in a fixture set. */
export async function loadSet(set: "public" | "private"): Promise<Sample[]> {
  const dir = new URL(`${set}/`, FIXTURES);
  if (!existsSync(dir)) return [];
  const labels = await readLabels(set);
  const files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith(".eml")).sort();
  const samples: Sample[] = [];
  for (const file of files) {
    const unwrapped = await unwrap(await parseEmail(await readFile(new URL(file, dir))));
    const original = { ...unwrapped, body: cleanBody(unwrapped.body) };
    samples.push({ set, file, label: labels[file], original, prefilter: prefilter(original) });
  }
  return samples;
}

/** Runs `fn` over `items` with at most `limit` in flight. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
