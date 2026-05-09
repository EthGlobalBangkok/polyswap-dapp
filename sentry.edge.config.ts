// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { isProductionEnvironment } from "./src/lib/env";

if (isProductionEnvironment()) {
  Sentry.init({
    dsn: "https://d190690c303492020ebc0c241b5bd560@o4510743731175424.ingest.de.sentry.io/4510743738974288",
    tracesSampleRate: 1,
    enableLogs: true,
    sendDefaultPii: true,
  });
}
