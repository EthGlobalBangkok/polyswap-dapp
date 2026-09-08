function isEnabled(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

export function isOrderCreationDisabled(): boolean {
  return isEnabled(process.env.ORDER_CREATION_DISABLED);
}

export function isDappMaintenanceMode(): boolean {
  return isEnabled(process.env.DAPP_MAINTENANCE);
}
