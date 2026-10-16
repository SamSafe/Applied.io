import { domainOf } from "./parse";
import type { Unwrapped } from "./unwrap";

/**
 * Sending domains of applicant tracking systems and job boards, mapped to a short name.
 * A seed list (docs/EMAIL_PIPELINE.md): validate against the fixture corpus and extend.
 */
export const ATS_DOMAINS: Record<string, string> = {
  "greenhouse.io": "greenhouse",
  "greenhouse-mail.io": "greenhouse",
  "lever.co": "lever",
  "myworkday.com": "workday",
  "myworkdayjobs.com": "workday",
  "workday.com": "workday",
  "ashbyhq.com": "ashby",
  "icims.com": "icims",
  "smartrecruiters.com": "smartrecruiters",
  "jobvite.com": "jobvite",
  "workablemail.com": "workable",
  "workable.com": "workable",
  "bamboohr.com": "bamboohr",
  "taleo.net": "taleo",
  "successfactors.com": "successfactors",
  "recruitee.com": "recruitee",
  "teamtailor.com": "teamtailor",
  "breezy.hr": "breezy",
  "applytojob.com": "jazzhr",
  "rippling.com": "rippling",
  "paradox.ai": "paradox",
  "codesignal.com": "codesignal",
  "hackerrank.com": "hackerrank",
  "hirevue.com": "hirevue",
};

/** Job-board senders that confirm applications (as opposed to their alert senders). */
const BOARD_APPLY_SENDERS: Record<string, string> = {
  "jobs-noreply@linkedin.com": "linkedin",
  "indeedapply@indeed.com": "indeed",
};

/** Senders that only ever send noise for our purposes. */
const NOISE_SENDERS = [
  /^jobalerts?-noreply@linkedin\.com$/,
  /^jobs-listings@linkedin\.com$/,
  /^alert@indeed\.com$/,
  /^(no-?reply|alerts?)@(glassdoor|ziprecruiter|monster)\.com$/,
];

const NOISE_SUBJECT =
  /\bjob alert\b|jobs? (you may|that match|recommended)|new jobs? for\b|\bis hiring\b|\d+\+? new jobs?\b|recommended jobs|weekly (digest|career)|newsletter|webinar/i;

/** Phrases that mark an email as part of an application's story, with weights. */
const SIGNALS: [RegExp, number][] = [
  [/thank(s| you) for (applying|your application|your interest)/i, 3],
  [/(application|resume) (was )?(received|submitted|sent to)/i, 3],
  [/received your application/i, 3],
  [/your application (to|for|with)/i, 2],
  // Generous on purpose: a wrongly kept email costs one cheap classification, a dropped one loses news.
  [/\binterview(s|ing)?\b/i, 3],
  [/phone screen|recruiter (call|screen)|quick (call|chat)/i, 2],
  [/\b(schedule|availability|calendly|time slots?)\b/i, 1],
  [/next steps?|move forward|moving forward|not (be )?moving forward/i, 2],
  [/unfortunately|other candidates|decided to (pursue|proceed)|not (been )?selected/i, 2],
  [/offer letter|pleased to (offer|extend)|extend (you )?an offer/i, 3],
  [/assessment|coding (challenge|test|exercise)|take-?home/i, 2],
  [/withdraw(n|al)? (your|my) application|request to withdraw/i, 3],
  [/\b(position|role|candidacy|opening)\b/i, 1],
  [
    /\b(recruit(er|ing)|hiring (team|manager)|talent (team|acquisition|partner)|head of talent|sourcer)\b/i,
    1,
  ],
  [
    /\bhiring for\b|great fit|came across your (profile|resume|background)|open to (a )?(quick )?chat/i,
    1,
  ],
];

const RELEVANT_SCORE = 3;

export interface PrefilterResult {
  relevant: boolean;
  reason: string;
  /** The ATS or job board that sent it, when known. */
  ats: string | null;
  score: number;
}

/** Deterministic first pass: decides which emails are worth classifying. No LLM involved. */
export function prefilter(email: Pick<Unwrapped, "from" | "subject" | "body">): PrefilterResult {
  const address = email.from?.address ?? "";
  const domain = address ? domainOf(address) : "";
  const ats = atsFor(address, domain);
  const subject = email.subject ?? "";
  const text = `${subject}\n${email.body.slice(0, 4000)}`;
  const score = SIGNALS.reduce((sum, [re, weight]) => sum + (re.test(text) ? weight : 0), 0);

  if (NOISE_SENDERS.some((re) => re.test(address))) {
    return { relevant: false, reason: "noise sender", ats: null, score };
  }
  if (NOISE_SUBJECT.test(subject) && !ats) {
    return { relevant: false, reason: "noise subject", ats: null, score };
  }
  if (ats) return { relevant: true, reason: `sent by ${ats}`, ats, score };
  if (score >= RELEVANT_SCORE)
    return { relevant: true, reason: `signal score ${score}`, ats: null, score };
  return { relevant: false, reason: `signal score ${score}`, ats: null, score };
}

function atsFor(address: string, domain: string): string | null {
  const board = BOARD_APPLY_SENDERS[address];
  if (board) return board;
  for (const [suffix, name] of Object.entries(ATS_DOMAINS)) {
    if (domain === suffix || domain.endsWith(`.${suffix}`)) return name;
  }
  return null;
}
