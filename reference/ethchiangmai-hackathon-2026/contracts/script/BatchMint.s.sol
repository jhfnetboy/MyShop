// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/CommunityNFT.sol";
import "forge-std/StdJson.sol";

contract BatchMintNFT is Script {
    using stdJson for string;

    function run() external {
        uint256 operatorPrivateKey = vm.envUint("OPERATOR_PRIVATE_KEY");
        address nftAddress = vm.envAddress("NFT_ADDRESS");
        
        // Metadata configuration
        string memory imageUrl = vm.envOr("IMAGE_URL", string("ipfs://sample-image"));
        string memory description = vm.envOr("DESCRIPTION", string("Community Airdrop NFT"));
        string memory activityName = vm.envOr("ACTIVITY_NAME", string("EthChiangMai 2026"));
        
        // Read addresses from JSON
        string memory root = vm.projectRoot();
        string memory path = string.concat(root, "/data/addresses.json");
        string memory json = vm.readFile(path);
        address[] memory recipients = json.readAddressArray("$");

        // Construct metadata JSON (simplified for this script, in practice you'd upload to IPFS/S3)
        // Here we just use a placeholder URI or construct a simple one
        string[] memory uris = new string[](recipients.length);
        for (uint256 i = 0; i < recipients.length; i++) {
            // For simplicity, we use the same URI for all in this batch, 
            // but can be extended to include activity name/entity in the URI string if needed.
            uris[i] = string.concat(
                "data:application/json;base64,",
                "{\"name\":\"", activityName, "\",\"description\":\"", description, "\",\"image\":\"", imageUrl, "\"}"
            );
        }

        bool[] memory flags = new bool[](recipients.length); // Default false

        vm.startBroadcast(operatorPrivateKey);
        CommunityNFT(nftAddress).batchMint(recipients, uris, flags);
        vm.stopBroadcast();

        console.log("Batch minted to", recipients.length, "addresses");
    }
}
