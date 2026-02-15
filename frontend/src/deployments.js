const DEPLOYMENTS = {
  anvil: {
    default: {
      rpcUrl: "http://127.0.0.1:8545",
      chainId: 31337,
      itemsAddress: "",
      shopsAddress: "",
      workerUrl: "http://127.0.0.1:8787",
      workerApiUrl: "http://127.0.0.1:8788"
    },
    versions: {
      demo: {
        rpcUrl: "http://127.0.0.1:8545",
        chainId: 31337,
        itemsAddress: "",
        shopsAddress: "",
        workerUrl: "http://127.0.0.1:8787",
        workerApiUrl: "http://127.0.0.1:8788"
      }
    }
  },
  sepolia: {
    default: {
      rpcUrl: "https://rpc.sepolia.org",
      chainId: 11155111,
      itemsAddress: "",
      shopsAddress: "",
      workerUrl: "",
      workerApiUrl: ""
    },
    versions: {
      v1: {
        rpcUrl: "https://rpc.sepolia.org",
        chainId: 11155111,
        itemsAddress: "",
        shopsAddress: "",
        workerUrl: "",
        workerApiUrl: ""
      }
    }
  }
};

export function getDeploymentDefaults(name) {
  if (!name) return {};

  const { env, version } = parseDeployment(name);
  const key = env.toLowerCase();
  const entry = DEPLOYMENTS[key];
  if (!entry) return {};

  if (version) {
    const resolved = entry.versions?.[version];
    if (resolved) return { ...entry.default, ...resolved, version };
  }

  return { ...entry.default, version };
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
