import { createPublicClient, http, keccak256, toBytes } from 'viem';
import { sepolia } from 'viem/chains';

const client = createPublicClient({
  chain: sepolia,
  transport: http()
});

const CONTRACT = "0x0c8EcCD5B98AfdBae8b282Ae98F4f4FFCcF9e560";
const ACCOUNT = "0x5313Cb83050D742a48934d87D435bf2a5e6B0bC8";
const MINTER_ROLE = keccak256(toBytes("MINTER_ROLE"));

const ABI = [
  {
    "inputs": [
      { "internalType": "bytes32", "name": "role", "type": "bytes32" },
      { "internalType": "address", "name": "account", "type": "address" }
    ],
    "name": "hasRole",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

async function main() {
  console.log(`Checking role for ${ACCOUNT} on ${CONTRACT}...`);
  console.log(`MINTER_ROLE: ${MINTER_ROLE}`);
  
  const hasRole = await client.readContract({
    address: CONTRACT,
    abi: ABI,
    functionName: 'hasRole',
    args: [MINTER_ROLE, ACCOUNT]
  });

  console.log(`Has MINTER_ROLE: ${hasRole}`);
}

main().catch(console.error);
