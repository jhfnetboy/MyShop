export function getDeploymentDefaults(name) {
  if (!name) return {};

  const { env, version } = parseDeployment(name);
  const key = env.toLowerCase();

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

  if (key === "sepolia") {
    return {
      rpcUrl: "https://rpc.sepolia.org",
      chainId: 11155111,
      itemsAddress: "",
      shopsAddress: "",
      workerUrl: "",
      workerApiUrl: "",
      version
    };
  }

  return {};
}

export function parseDeployment(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return { env: "", version: "" };

  let env = raw;
  let version = "";

  const at = raw.indexOf("@");
  const colon = raw.indexOf(":");
  const sep = at >= 0 ? at : colon;

  if (sep >= 0) {
    env = raw.slice(0, sep).trim();
    version = raw.slice(sep + 1).trim();
  }

  return { env, version };
}
