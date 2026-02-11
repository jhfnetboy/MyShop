// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/CommunityNFT.sol";

contract Anni_Step3_MintTransferable is Script {
    function run() external {
        uint256 anniKey = vm.envUint("ANNI_PRIVATE_KEY");
        address nftAddr = vm.envAddress("ANNI_NFT_ADDRESS");
        address bobAddr = vm.envAddress("ADDRESS_BOB_EOA");
        
        vm.startBroadcast(anniKey);

        CommunityNFT nft = CommunityNFT(nftAddr);
        
        // Minting a NON-SOULBOUND (transferable) NFT to Bob
        nft.mint(bobAddr, "ipfs://anni-reward-to-bob", false); 

        console.log("Transferable NFT (Token #0) minted to Bob at:", bobAddr);

        vm.stopBroadcast();
    }
}
