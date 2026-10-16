import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { type ClassifierInput, SYSTEM_PROMPT, userMessage } from "./prompt";
import { Classification, MAX_EVIDENCE_CHARS } from "./schema";

/** Chosen by the owner (docs/EMAIL_PIPELINE.md → "Model and cost"). */
export const CLASSIFIER_MODEL = "claude-haiku-5-5";

/** Bump whenever the prompt, schema or model changes, so stored results can be compared. */
export const CLASSIFIER_VERSION = "2026-10-16.1";

export interface ClassifyResult {
  classification: Classification;
  model: string;
  version: string;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

export class ClassificationError extends Error {
  constructor(
    readonly reason: "refusal" | "max_tokens" | "unparseable",
    message: string,
  ) {
    super(message);
    this.name = "ClassificationError";
  }
}

/**
 * One structured-output call per email. Takes the client as a parameter so the worker, the
 * eval runner and tests each supply their own. API errors (rate limits, outages) propagate as
 * the SDK's typed errors for the caller to retry; content problems become ClassificationError.
 */
export async function classifyEmail(
  client: Pick<Anthropic, "messages">,
  input: ClassifierInput,
): Promise<ClassifyResult> {
  const response = await client.messages.parse({
    model: CLASSIFIER_MODEL,
    max_tokens: 4096,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMessage(input) }],
    output_config: { effort: "low", format: zodOutputFormat(Classification) },
  });

  if (response.stop_reason === "refusal") {
    throw new ClassificationError("refusal", "The model declined to classify this email");
  }
  if (response.stop_reason === "max_tokens") {
    throw new ClassificationError("max_tokens", "The classification was cut off");
  }
  const parsed = response.parsed_output;
  if (!parsed)
    throw new ClassificationError("unparseable", "The classification didn't match the schema");

  return {
    classification: { ...parsed, evidence: parsed.evidence.slice(0, MAX_EVIDENCE_CHARS) },
    model: response.model,
    version: CLASSIFIER_VERSION,
    usage: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
      cacheRead: response.usage.cache_read_input_tokens ?? 0,
      cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
    },
  };
}
