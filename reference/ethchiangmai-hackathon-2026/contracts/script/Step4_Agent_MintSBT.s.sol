// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/CommunityNFT.sol";

contract Agent_Step4_MintSBT is Script {
    function run() external {
        uint256 agentKey = vm.envUint("AI_AGENT_PIRVATE_KEY");
        address nftAddr = vm.envAddress("ANNI_NFT_ADDRESS");
        address bobAddr = vm.envAddress("ADDRESS_BOB_EOA");
        
        vm.startBroadcast(agentKey);

        CommunityNFT nft = CommunityNFT(nftAddr);
        
        // AI Agent minting a SOULBOUND (SBT) NFT to Bob
        nft.mint(bobAddr, "ipfs://agent-reputation-to-bob", true); 

        console.log("Soulbound NFT (Token #1) minted to Bob by AI Agent");

        vm.stopBroadcast();
    }
}
