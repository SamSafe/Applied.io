// Optional secrets that `wrangler types` can't see (they're absent from .dev.vars by default).
interface OptionalSecrets {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
}
interface Env extends OptionalSecrets {}
declare namespace Cloudflare {
  interface Env extends OptionalSecrets {}
}
