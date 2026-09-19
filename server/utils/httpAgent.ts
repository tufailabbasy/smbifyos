import { Agent } from "undici";

/**
 * Dedicated HTTP dispatcher for auditing client & prospect websites.
 * This explicitly allows auditing targets with self-signed, misconfigured, or expired SSL certificates,
 * WITHOUT globally disabling TLS verification for the rest of the application (e.g. AI APIs, OAuth, SMTP).
 */
export const auditCrawlerDispatcher = new Agent({
  connect: {
    rejectUnauthorized: false,
  },
  headersTimeout: 20000,
  bodyTimeout: 30000,
});
