pragma solidity ^0.8.20;

import {IERC20} from "forge-std/interfaces/IERC20.sol";

interface IRegistryHasRole {
    function hasRole(bytes32 role, address account) external view returns (bool);
}

contract MyShops {
    bytes32 public constant ROLE_COMMUNITY = keccak256("COMMUNITY");

    address public owner;
    address public registry;

    address public platformTreasury;
    address public listingFeeToken;
    uint256 public listingFeeAmount;
    uint16 public platformFeeBps;

    uint256 public shopCount;

    struct Shop {
        address owner;
        address treasury;
        bytes32 metadataHash;
        bool paused;
    }

    mapping(uint256 => Shop) public shops;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event RegistryUpdated(address indexed registry);
    event PlatformTreasuryUpdated(address indexed treasury);
    event ListingFeeUpdated(address indexed token, uint256 amount);
    event PlatformFeeUpdated(uint16 feeBps);
    event ShopRegistered(
        uint256 indexed shopId, address indexed shopOwner, address indexed treasury, bytes32 metadataHash
    );
    event ShopUpdated(uint256 indexed shopId, address indexed treasury, bytes32 metadataHash);
    event ShopPaused(uint256 indexed shopId, bool paused);

    error NotOwner();
    error InvalidAddress();
    error InvalidFeeBps();
    error NotCommunity();
    error NotShopOwner();
    error ShopNotFound();

    constructor(
        address registry_,
        address platformTreasury_,
        address listingFeeToken_,
        uint256 listingFeeAmount_,
        uint16 platformFeeBps_
    ) {
        owner = msg.sender;
        registry = registry_;
        platformTreasury = platformTreasury_;
        listingFeeToken = listingFeeToken_;
        listingFeeAmount = listingFeeAmount_;
        platformFeeBps = platformFeeBps_;

        if (registry_ == address(0) || platformTreasury_ == address(0) || listingFeeToken_ == address(0)) {
            revert InvalidAddress();
        }
        if (platformFeeBps_ > 2000) revert InvalidFeeBps();
        emit OwnershipTransferred(address(0), msg.sender);
        emit RegistryUpdated(registry_);
        emit PlatformTreasuryUpdated(platformTreasury_);
        emit ListingFeeUpdated(listingFeeToken_, listingFeeAmount_);
        emit PlatformFeeUpdated(platformFeeBps_);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setRegistry(address registry_) external onlyOwner {
        if (registry_ == address(0)) revert InvalidAddress();
        registry = registry_;
        emit RegistryUpdated(registry_);
    }

    function setPlatformTreasury(address treasury) external onlyOwner {
        if (treasury == address(0)) revert InvalidAddress();
        platformTreasury = treasury;
        emit PlatformTreasuryUpdated(treasury);
    }

    function setListingFee(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) revert InvalidAddress();
        listingFeeToken = token;
        listingFeeAmount = amount;
        emit ListingFeeUpdated(token, amount);
    }

    function setPlatformFee(uint16 feeBps) external onlyOwner {
        if (feeBps > 2000) revert InvalidFeeBps();
        platformFeeBps = feeBps;
        emit PlatformFeeUpdated(feeBps);
    }

    function registerShop(address treasury, bytes32 metadataHash) external returns (uint256 shopId) {
        if (!IRegistryHasRole(registry).hasRole(ROLE_COMMUNITY, msg.sender)) revert NotCommunity();
        if (treasury == address(0)) revert InvalidAddress();

        shopId = ++shopCount;
        shops[shopId] = Shop({owner: msg.sender, treasury: treasury, metadataHash: metadataHash, paused: false});

        emit ShopRegistered(shopId, msg.sender, treasury, metadataHash);
    }

    function updateShop(uint256 shopId, address treasury, bytes32 metadataHash) external {
        Shop storage shop = shops[shopId];
        if (shop.owner == address(0)) revert ShopNotFound();
        if (shop.owner != msg.sender) revert NotShopOwner();
        if (treasury == address(0)) revert InvalidAddress();

        shop.treasury = treasury;
        shop.metadataHash = metadataHash;

        emit ShopUpdated(shopId, treasury, metadataHash);
    }

    function setShopPaused(uint256 shopId, bool paused) external {
        Shop storage shop = shops[shopId];
        if (shop.owner == address(0)) revert ShopNotFound();
        if (shop.owner != msg.sender && msg.sender != owner) revert NotShopOwner();
        shop.paused = paused;
        emit ShopPaused(shopId, paused);
    }
}

