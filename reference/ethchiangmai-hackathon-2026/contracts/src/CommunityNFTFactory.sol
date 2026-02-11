// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./CommunityNFT.sol";
// Minimal interface if not available
interface IRegistryMin {
    function hasRole(bytes32 role, address account) external view returns (bool);
}

/**
 * @title CommunityNFTFactory
 * @dev Factory for deploying gas-efficient Clones of CommunityNFT.
 */
contract CommunityNFTFactory {
    using Clones for address;

    address public immutable implementation;
    address public immutable registry;
    bytes32 public constant ROLE_COMMUNITY = keccak256("COMMUNITY");

    event CommunityNFTDeployed(
        address indexed communityOwner,
        address indexed tokenAddress,
        string name,
        string symbol,
        CommunityNFT.ValidationMode mode
    );

    constructor(address _registry) {
        require(_registry != address(0), "Invalid Registry");
        implementation = address(new CommunityNFT());
        registry = _registry;
    }

    /**
     * @notice Deploy a new CommunityNFT clone.
     * @param name Name of the NFT
     * @param symbol Symbol of the NFT
     * @param mode Validation Mode (SBT, Transferable, Hybrid)
     */
    function deployCommunityNFT(
        string memory name,
        string memory symbol,
        CommunityNFT.ValidationMode mode
    ) external returns (address) {
        // 1. Verify Caller is a Community (via Registry)
        require(
            IRegistryMin(registry).hasRole(ROLE_COMMUNITY, msg.sender),
            "Caller must be a registered Community"
        );

        // 2. Clone Implementation
        address clone = implementation.clone();

        // 3. Initialize Clone
        CommunityNFT(clone).initialize(name, symbol, msg.sender, mode);

        emit CommunityNFTDeployed(msg.sender, clone, name, symbol, mode);
        return clone;
    }
}
