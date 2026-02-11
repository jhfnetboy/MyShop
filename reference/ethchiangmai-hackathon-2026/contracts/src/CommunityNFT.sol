// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

/**
 * @title CommunityNFT
 * @dev ERC721 NFT for community airdrops with permissionless minting via AI Agents.
 *      Supports "Soulbound" (SBT), "Transferable", or "Hybrid" modes.
 *      Designed for usage with EIP-1167 Clones.
 */
contract CommunityNFT is ERC721URIStorage, AccessControl, Initializable {
    
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    
    uint256 private _nextTokenId;

    // Clone-compatible storage for metadata
    string private _name;
    string private _symbol;

    enum ValidationMode { STRICT_SBT, TRANSFERABLE, HYBRID }
    ValidationMode public mode;

    // For HYBRID mode: track if a specific token is soulbound
    mapping(uint256 => bool) public isTokenSoulbound;

    event CommunityNFTMinted(address indexed recipient, uint256 indexed tokenId, string tokenURI, bool isSoulbound);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() ERC721("", "") {
        _disableInitializers();
    }

    /**
     * @notice Initialize the community NFT contract (Factory Pattern)
     * @param name_ Token Name
     * @param symbol_ Token Symbol
     * @param owner_ Community Owner (Admin)
     * @param mode_ Validation Mode (SBT, Transferable, Hybrid)
     */
    function initialize(
        string memory name_,
        string memory symbol_,
        address owner_,
        ValidationMode mode_
    ) external initializer {
        require(owner_ != address(0), "Invalid owner");
        
        _name = name_;
        _symbol = symbol_;
        mode = mode_;

        // Grant Admin and Minter roles to the Community Owner
        _grantRole(DEFAULT_ADMIN_ROLE, owner_);
        _grantRole(MINTER_ROLE, owner_);
    }

    /**
     * @dev Override name() to read from storage (Clone-safe)
     */
    function name() public view virtual override returns (string memory) {
        return _name;
    }

    /**
     * @dev Override symbol() to read from storage (Clone-safe)
     */
    function symbol() public view virtual override returns (string memory) {
        return _symbol;
    }

    /**
     * @dev Batch mint NFTs. 
     *      If mode is HYBRID, `isSoulbound` param applies. 
     *      If STRICT_SBT, forced true. If TRANSFERABLE, forced false.
     * @param recipients recipients
     * @param tokenURIs URIs
     * @param soulboundFlags Only used if mode == HYBRID
     */
    function batchMint(
        address[] calldata recipients,
        string[] calldata tokenURIs,
        bool[] calldata soulboundFlags
    ) external onlyRole(MINTER_ROLE) {
        require(recipients.length == tokenURIs.length, "Length mismatch");
        if (mode == ValidationMode.HYBRID) {
            require(soulboundFlags.length == recipients.length, "Flags length mismatch");
        }

        for (uint256 i = 0; i < recipients.length; i++) {
            bool sb = _resolveSoulboundStatus(i, soulboundFlags);
            _safeMintInternal(recipients[i], tokenURIs[i], sb);
        }
    }

    /**
     * @dev Single mint helper for AI Agents
     */
    function mint(address to, string calldata uri, bool soulbound) external onlyRole(MINTER_ROLE) returns (uint256) {
        bool sb = (mode == ValidationMode.HYBRID) ? soulbound : (mode == ValidationMode.STRICT_SBT);
        return _safeMintInternal(to, uri, sb);
    }

    function _safeMintInternal(address to, string memory uri, bool soulbound) internal returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        
        if (soulbound) {
            isTokenSoulbound[tokenId] = true;
        }

        emit CommunityNFTMinted(to, tokenId, uri, soulbound);
        return tokenId;
    }

    function _resolveSoulboundStatus(uint256 index, bool[] calldata flags) internal view returns (bool) {
        if (mode == ValidationMode.STRICT_SBT) return true;
        if (mode == ValidationMode.TRANSFERABLE) return false;
        return flags[index];
    }

    /**
     * @dev Hook to block transfers for Soulbound tokens
     */
    function _update(address to, uint256 tokenId, address auth) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);
        
        // Skip check for minting (from == 0) and burning (to == 0)
        if (from != address(0) && to != address(0)) {
            bool sb = (mode == ValidationMode.STRICT_SBT) || (mode == ValidationMode.HYBRID && isTokenSoulbound[tokenId]);
            require(!sb, "CommunityNFT: Soulbound token cannot be transferred");
        }
        
        return super._update(to, tokenId, auth);
    }

    /**
     * @notice Burn a token. Only the owner or an authorized operator can burn.
     */
    function burn(uint256 tokenId) external {
        _checkAuthorized(_ownerOf(tokenId), _msgSender(), tokenId);
        _burn(tokenId);
    }

    // Boilerplate for AccessControl + ERC721 support
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721URIStorage, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
