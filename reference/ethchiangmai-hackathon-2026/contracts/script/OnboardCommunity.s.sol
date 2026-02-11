// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/CommunityNFT.sol";
import "../src/CommunityNFTFactory.sol";

contract OnboardCommunity is Script {
    function run() external {
        uint256 ownerKey = vm.envUint("OWNER_PRIVATE_KEY");
        address factoryAddr = vm.envAddress("FACTORY_ADDRESS");
        
        vm.startBroadcast(ownerKey);

        CommunityNFTFactory factory = CommunityNFTFactory(factoryAddr);

        // 1. Deploy Clone (Mode: HYBRID)
        address nftAddr = factory.deployCommunityNFT(
            "Sepolia Test Pass",
            "STPASS",
            CommunityNFT.ValidationMode.HYBRID
        );
        
        console.log("CommunityNFT Clone deployed at:", nftAddr);

        CommunityNFT nft = CommunityNFT(nftAddr);

        // 2. Mint test NFT to owner
        address me = vm.addr(ownerKey);
        nft.mint(me, "ipfs://test-sepolia", true); 

        console.log("Test NFT minted to:", me);

        vm.stopBroadcast();
    }
}
