import { createWalletClient, http, createPublicClient, parseAbiItem, defineChain, createClient, getContract } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// Load env from root or current dir. Assuming root for now as per plan
dotenv.config({ path: '../../.env' }); 

// Minimal ABI for CommunityNFT.mint
const ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "string", "name": "uri", "type": "string" },
      { "internalType": "bool", "name": "soulbound", "type": "bool" }
    ],
    "name": "mint",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "account", "type": "address" },
      { "internalType": "bytes32", "name": "neededRole", "type": "bytes32" }
    ],
    "name": "AccessControlUnauthorizedAccount",
    "type": "error"
  }
] as const;

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('to', { type: 'string', demandOption: true })
    .option('uri', { type: 'string', demandOption: true })
    .option('soulbound', { type: 'boolean', default: false })
    .option('contract', { type: 'string', demandOption: true })
    .help()
    .argv;
  
  const privateKey = process.env.AI_AGENT_PRIVATE_KEY;
  if (!privateKey) {
    console.error(JSON.stringify({ success: false, error: "AI_AGENT_PRIVATE_KEY not found in .env" }));
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const client = createWalletClient({
    account,
    chain: sepolia,
    transport: http() // uses public RPC or specified in transport
  });
  
  const publicClient = createPublicClient({
      chain: sepolia,
      transport: http()
  });

  try {
    const { request } = await publicClient.simulateContract({
      address: argv.contract as `0x${string}`,
      abi: ABI,
      functionName: 'mint',
      args: [argv.to as `0x${string}`, argv.uri, argv.soulbound],
      account
    });

    const hash = await client.writeContract(request);

    // Wait for receipt
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
        // Try to find tokenId in logs.
        // Event: CommunityNFTMinted(address indexed recipient, uint256 indexed tokenId, string tokenURI, bool isSoulbound)
        // Check logs
        // This is a rough check; for production, parsing logs is better.
        // But the task just needs "success" and "tx".
        console.log(JSON.stringify({ 
            success: true, 
            tx: hash,
            blockNumber: receipt.blockNumber.toString(),
            // We can parse logs if needed, but for now tx hash is sufficient for the bot report
            result: "Minted"
        }));
    } else {
        console.error(JSON.stringify({ success: false, error: "Transaction reverted", tx: hash }));
        process.exit(1);
    }

  } catch (error: any) {
    console.error(JSON.stringify({ success: false, error: error.message || String(error) }));
    process.exit(1);
  }
}

main();
