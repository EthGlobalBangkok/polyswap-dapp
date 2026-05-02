import { MarketUpdateService } from "@/backend/services/marketUpdateService";

/**
 * Start the periodic Polymarket-to-DB market sync.
 * Thin wrapper around MarketUpdateService so the listener entrypoint
 * can compose all crons with a single shape.
 */
export function startMarketSync(intervalMinutes = 60): void {
  MarketUpdateService.startUpdateRoutine(intervalMinutes);
}

export function stopMarketSync(): void {
  MarketUpdateService.stopUpdateRoutine();
}
