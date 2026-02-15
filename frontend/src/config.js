import { getDeploymentDefaults } from "./deployments.js";

export function loadConfig() {
  const deployment = import.meta.env.VITE_DEPLOYMENT ?? "";
  const defaults = getDeploymentDefaults(deployment);

  const raw = {
    rpcUrl: import.meta.env.VITE_RPC_URL ?? defaults.rpcUrl ?? "",
    chainId: import.meta.env.VITE_CHAIN_ID ?? (defaults.chainId != null ? String(defaults.chainId) : ""),
    itemsAddress: import.meta.env.VITE_ITEMS_ADDRESS ?? defaults.itemsAddress ?? "",
    shopsAddress: import.meta.env.VITE_SHOPS_ADDRESS ?? defaults.shopsAddress ?? "",
    workerUrl: import.meta.env.VITE_WORKER_URL ?? defaults.workerUrl ?? "",
    workerApiUrl: import.meta.env.VITE_WORKER_API_URL ?? defaults.workerApiUrl ?? "",
    apntsSaleUrl: import.meta.env.VITE_APNTS_SALE_URL ?? defaults.apntsSaleUrl ?? "",
    gtokenSaleUrl: import.meta.env.VITE_GTOKEN_SALE_URL ?? defaults.gtokenSaleUrl ?? ""
  };

  const cfg = {
    rpcUrl: raw.rpcUrl ?? "",
    chainId: raw.chainId ? Number(raw.chainId) : 0,
    itemsAddress: raw.itemsAddress ?? "",
    shopsAddress: raw.shopsAddress ?? "",
    workerUrl: raw.workerUrl ?? "",
    workerApiUrl: raw.workerApiUrl ?? "",
    apntsSaleUrl: raw.apntsSaleUrl ?? "",
    gtokenSaleUrl: raw.gtokenSaleUrl ?? ""
  };

  return cfg;
}
