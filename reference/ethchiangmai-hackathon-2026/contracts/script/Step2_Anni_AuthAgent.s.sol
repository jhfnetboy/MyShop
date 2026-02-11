// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/CommunityNFT.sol";

contract Anni_Step2_AuthAgent is Script {
    function run() external {
        uint256 anniKey = vm.envUint("ANNI_PRIVATE_KEY");
        address nftAddr = vm.envAddress("ANNI_NFT_ADDRESS");
        address agentAddr = vm.envAddress("AI_AGENT_ADDRESS");
        
        vm.startBroadcast(anniKey);

        CommunityNFT nft = CommunityNFT(nftAddr);
        nft.grantRole(nft.MINTER_ROLE(), agentAddr);

        console.log("AI Agent", agentAddr, "authorized in Anni's NFT contract");

        vm.stopBroadcast();
    }
}
