pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

contract GeneratePermit is Script {
    function run() external {
        string memory kind = vm.envString("PERMIT_KIND");
        address verifyingContract = vm.envAddress("ITEMS_ADDRESS");
        uint256 signerPk = vm.envUint("SIGNER_PK");

        bytes32 digest;
        if (_eq(kind, "risk")) {
            address shopOwner = vm.envAddress("SHOP_OWNER");
            uint256 maxItems = vm.envUint("MAX_ITEMS");
            uint256 deadline = vm.envUint("DEADLINE");
            uint256 nonce = vm.envUint("NONCE");
            digest = _hashRiskAllowance(verifyingContract, shopOwner, maxItems, deadline, nonce);
        } else if (_eq(kind, "serial")) {
            uint256 itemId = vm.envUint("ITEM_ID");
            address buyer = vm.envAddress("BUYER");
            bytes32 serialHash = vm.envBytes32("SERIAL_HASH");
            uint256 deadline = vm.envUint("DEADLINE");
            uint256 nonce = vm.envUint("NONCE");
            digest = _hashSerialPermit(verifyingContract, itemId, buyer, serialHash, deadline, nonce);
        } else {
            revert("PERMIT_KIND must be risk|serial");
        }

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        console2.logBytes32(digest);
        console2.logBytes(signature);
    }

    function _hashRiskAllowance(
        address verifyingContract,
        address shopOwner,
        uint256 maxItems,
        uint256 deadline,
        uint256 nonce
    ) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("RiskAllowance(address shopOwner,uint256 maxItems,uint256 deadline,uint256 nonce)"),
                shopOwner,
                maxItems,
                deadline,
                nonce
            )
        );
        return _hashTypedDataV4(verifyingContract, structHash);
    }

    function _hashSerialPermit(
        address verifyingContract,
        uint256 itemId,
        address buyer,
        bytes32 serialHash,
        uint256 deadline,
        uint256 nonce
    ) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "SerialPermit(uint256 itemId,address buyer,bytes32 serialHash,uint256 deadline,uint256 nonce)"
                ),
                itemId,
                buyer,
                serialHash,
                deadline,
                nonce
            )
        );
        return _hashTypedDataV4(verifyingContract, structHash);
    }

    function _hashTypedDataV4(address verifyingContract, bytes32 structHash) internal view returns (bytes32) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("MyShop")),
                keccak256(bytes("1")),
                block.chainid,
                verifyingContract
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function _eq(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}

