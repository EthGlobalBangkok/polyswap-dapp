/**
 * Resolves the runtime environment from the `ENVIRONMENT` env var.
 *
 *   prod | production  → production
 *   dev  | local        → development (default)
 *
 * Mirrored into the client bundle via `next.config.ts` `env`.
 */
export function isProductionEnvironment(): boolean {
  const raw = (process.env.ENVIRONMENT ?? "").trim().toLowerCase();
  return raw === "prod" || raw === "production";
}
