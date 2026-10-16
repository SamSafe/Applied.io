import { app } from "./api";
import { handleEmail } from "./email";
import { purgeExpired } from "./purge";
import { handleQueue, type MailQueueMessage } from "./queue";

export default {
  fetch: app.fetch,
  email: handleEmail,
  queue: handleQueue,
  scheduled: async (controller, env, ctx) => {
    ctx.waitUntil(
      purgeExpired(env, new Date(controller.scheduledTime)).then((r) =>
        console.log(`retention: deleted ${r.raw} raw emails, ${r.filtered} filtered-out records`),
      ),
    );
  },
} satisfies ExportedHandler<Env, MailQueueMessage>;
