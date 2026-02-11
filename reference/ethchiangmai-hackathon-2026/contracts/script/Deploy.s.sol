// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/CommunityNFT.sol";
import "../src/CommunityNFTFactory.sol";

contract DeployCommunityNFT is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("OWNER_PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        string memory name = "Community Pass";
        string memory symbol = "CPASS";
        // Sepolia Registry Address
        address registry = 0x7Ba70C5bFDb3A4d0cBd220534f3BE177fefc1788; 

        CommunityNFTFactory factory = new CommunityNFTFactory(registry);

        console.log("CommunityNFTFactory deployed to:", address(factory));
        console.log("Implementation deployed to:", factory.implementation());

        vm.stopBroadcast();
    }
}
