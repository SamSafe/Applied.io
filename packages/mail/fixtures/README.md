# Email fixtures

- `public/`: **synthetic** emails. Every company and person is fictional; sender domains of
  real ATS platforms appear only so the prefilter can be tested. Committed, and run in CI.
- `private/`: your own job emails, exported as `.eml`. **Gitignored; never commit them.**

Each folder has a `labels.json` keyed by file name:

```json
{
  "example.eml": {
    "relevant": true,
    "category": "interview_invite",
    "interviewKind": "recruiter_screen",
    "company": "Acme",
    "position": "Software Engineer"
  }
}
```

`relevant` is whether the prefilter should keep it. `category` is one of the classifier's
categories (`packages/mail/src/classify/schema.ts`). Use `null` for facts the email doesn't
state.

Exporting from Gmail: open the email → ⋮ → "Download message". From Outlook on the web:
⋯ → "Save as" (.eml). Then run `pnpm --filter @apptracker/mail label` to prefill labels,
correct them by hand, and run `pnpm --filter @apptracker/mail eval --private --yes`.
