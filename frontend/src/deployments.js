export function getDeploymentDefaults(name) {
  if (!name) return {};

  const key = String(name).toLowerCase();

  if (key === "anvil" || key === "anvil-hardhat" || key === "local-anvil") {
    return {
      rpcUrl: "http://127.0.0.1:8545",
      chainId: 31337,
      itemsAddress: "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707",
      shopsAddress: "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
      workerUrl: "http://127.0.0.1:8787",
      workerApiUrl: "http://127.0.0.1:8788"
    };
  }

  return {};
}
