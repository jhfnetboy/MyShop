// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/CommunityNFT.sol";
import "../src/CommunityNFTFactory.sol";

contract Anni_Step1_Deploy is Script {
    function run() external {
        uint256 anniKey = vm.envUint("ANNI_PRIVATE_KEY");
        address factoryAddr = vm.envAddress("FACTORY_ADDRESS");
        
        vm.startBroadcast(anniKey);

        CommunityNFTFactory factory = CommunityNFTFactory(factoryAddr);

        // Deploy Clone (Mode: HYBRID)
        address nftAddr = factory.deployCommunityNFT(
            "Anni Community",
            "ANNI",
            CommunityNFT.ValidationMode.HYBRID
        );
        
        console.log("Anni's CommunityNFT deployed at:", nftAddr);

        vm.stopBroadcast();
    }
}
