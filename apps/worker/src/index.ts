import { app } from "./api";
import { handleEmail } from "./email";
import { handleQueue, type MailQueueMessage } from "./queue";

export default {
  fetch: app.fetch,
  email: handleEmail,
  queue: handleQueue,
} satisfies ExportedHandler<Env, MailQueueMessage>;
