import { privateKeyToAccount } from 'viem/accounts';
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

const pk = process.env.PRIVATE_KEY;
if (!pk) {
    console.error("No PRIVATE_KEY");
    process.exit(1);
}

// Handle decimal
let hexPk = pk;
if (/^\d+$/.test(pk)) {
    hexPk = "0x" + BigInt(pk).toString(16);
}

const account = privateKeyToAccount(hexPk);
console.log("Address:", account.address);
