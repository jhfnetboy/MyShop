export function loadConfig() {
  const raw = {
    rpcUrl: import.meta.env.VITE_RPC_URL,
    chainId: import.meta.env.VITE_CHAIN_ID,
    itemsAddress: import.meta.env.VITE_ITEMS_ADDRESS,
    shopsAddress: import.meta.env.VITE_SHOPS_ADDRESS,
    workerUrl: import.meta.env.VITE_WORKER_URL,
    workerApiUrl: import.meta.env.VITE_WORKER_API_URL
  };

  const cfg = {
    rpcUrl: raw.rpcUrl ?? "",
    chainId: raw.chainId ? Number(raw.chainId) : 0,
    itemsAddress: raw.itemsAddress ?? "",
    shopsAddress: raw.shopsAddress ?? "",
    workerUrl: raw.workerUrl ?? "",
    workerApiUrl: raw.workerApiUrl ?? ""
  };

  return cfg;
}
