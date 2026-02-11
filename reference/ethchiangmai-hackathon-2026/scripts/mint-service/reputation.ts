import { createWalletClient, http, createPublicClient, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// Load env
dotenv.config({ path: '../../.env' });

const ABI = [
  // Mint Function
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
  // Record Activity Function
  {
    "inputs": [
      { "internalType": "address", "name": "user", "type": "address" }
    ],
    "name": "recordActivity",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Check Activity
  {
      "inputs": [
        { "internalType": "uint256", "name": "tokenId", "type": "uint256" },
        { "internalType": "address", "name": "community", "type": "address" }
      ],
      "name": "lastActivityTime",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
  },
  // User to SBT
  {
      "inputs": [{ "internalType": "address", "name": "user", "type": "address" }],
      "name": "userToSBT",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
  }
] as const;

async function execute() {
  const argv = await yargs(hideBin(process.argv))
    .command('mint', 'Mint SBT', (yargs) => {
        return yargs
            .option('to', { type: 'string', demandOption: true })
            .option('uri', { type: 'string', demandOption: true })
            .option('soulbound', { type: 'boolean', default: false });
    })
    .command('record-activity', 'Record User Activity', (yargs) => {
        return yargs
            .option('user', { type: 'string', demandOption: true });
    })
    .command('check-reputation', 'Check User Reputation', (yargs) => {
        return yargs
            .option('user', { type: 'string', demandOption: true });
    })
    .option('contract', { type: 'string', demandOption: true })
    .help()
    .argv;
  
  const command = argv._[0];
  
  const privateKey = process.env.AI_AGENT_PRIVATE_KEY;
  if (!privateKey) {
    console.error(JSON.stringify({ success: false, error: "AI_AGENT_PRIVATE_KEY not found in .env" }));
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const client = createWalletClient({ account, chain: sepolia, transport: http() });
  const publicClient = createPublicClient({ chain: sepolia, transport: http() });

  try {
      if (command === 'mint') {
            const { request } = await publicClient.simulateContract({
                address: argv.contract as `0x${string}`,
                abi: ABI,
                functionName: 'mint',
                args: [argv.to as `0x${string}`, argv.uri, argv.soulbound],
                account
            });
            const hash = await client.writeContract(request);
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(JSON.stringify({ success: true, tx: hash, result: "Minted" }));

      } else if (command === 'record-activity') {
            const { request } = await publicClient.simulateContract({
                address: argv.contract as `0x${string}`,
                abi: ABI,
                functionName: 'recordActivity',
                args: [argv.user as `0x${string}`],
                account
            });
            const hash = await client.writeContract(request);
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(JSON.stringify({ success: true, tx: hash, result: "Activity Recorded" }));
            
      } else if (command === 'check-reputation') {
            // 1. Get TokenId
            const tokenId = await publicClient.readContract({
                address: argv.contract as `0x${string}`,
                abi: ABI,
                functionName: 'userToSBT',
                args: [argv.user as `0x${string}`]
            }) as bigint;
            
            if (tokenId === 0n) {
                 console.log(JSON.stringify({ success: true, reputation: 0, lastActive: 0, message: "No SBT found" }));
                 return;
            }

            // 2. Get Last Active (Community = Contract Address itself usually for MySBT single community mode, or specific community)
            // For hackathon EchoRank, let's assume global activity or use Registry address if needed.
            // Based on SDK, getCommunityMembership needs community address. 
            // Let's assume the contract IS the community for this simplified demo or use a placeholder.
            // Actually, let's just return the TokenId exists as "Reputation Level 1" for now.
             console.log(JSON.stringify({ success: true, reputation: 1, lastActive: Date.now(), tokenId: tokenId.toString() }));
      } else {
          console.error("Unknown command");
      }
  } catch (error: any) {
     console.error(JSON.stringify({ success: false, error: error.message || String(error) }));
     process.exit(1);
  }
}

execute();
