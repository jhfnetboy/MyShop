// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/CommunityNFT.sol";
import "../src/CommunityNFTFactory.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

// Mock minimal Registry for Factory testing
contract MockRegistry {
    bytes32 public constant ROLE_COMMUNITY = keccak256("COMMUNITY");
    mapping(bytes32 => mapping(address => bool)) public roles;

    function hasRole(bytes32 role, address account) external view returns (bool) {
        return roles[role][account];
    }

    function grantRole(bytes32 role, address account) external {
        roles[role][account] = true;
    }
}

contract CommunityNFTTest is Test {
    CommunityNFTFactory public factory;
    MockRegistry public registry;
    CommunityNFT public nft;

    address public owner = address(0x1);
    address public agent = address(0x2);
    address public user1 = address(0x3);
    address public user2 = address(0x4);
    address public hacker = address(0x5);

    function setUp() public {
        vm.startPrank(owner);
        registry = new MockRegistry();
        registry.grantRole(keccak256("COMMUNITY"), owner);
        factory = new CommunityNFTFactory(address(registry));
        vm.stopPrank();
    }

    // ============================================
    // Factory & Initialization Tests
    // ============================================

    function test_Factory_Deploy_Success() public {
        vm.startPrank(owner);
        address addr = factory.deployCommunityNFT("Test", "TST", CommunityNFT.ValidationMode.STRICT_SBT);
        CommunityNFT deployed = CommunityNFT(addr);
        
        assertEq(deployed.name(), "Test");
        assertEq(deployed.symbol(), "TST");
        assertTrue(deployed.hasRole(deployed.DEFAULT_ADMIN_ROLE(), owner));
        assertTrue(deployed.hasRole(deployed.MINTER_ROLE(), owner));
        // Verify Mapping
        assertEq(uint256(deployed.mode()), uint256(CommunityNFT.ValidationMode.STRICT_SBT));
    }

    function test_Factory_Deploy_Revert_Unauthorized() public {
        vm.startPrank(hacker);
        // Hacker does not have ROLE_COMMUNITY in registry
        vm.expectRevert("Caller must be a registered Community");
        factory.deployCommunityNFT("Hack", "HCK", CommunityNFT.ValidationMode.TRANSFERABLE);
        vm.stopPrank();
    }

    function test_Initialization_Revert_DoubleInit() public {
        vm.startPrank(owner);
        address addr = factory.deployCommunityNFT("Test", "TST", CommunityNFT.ValidationMode.TRANSFERABLE);
        CommunityNFT deployed = CommunityNFT(addr);
        
        // Try to initialize again
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        deployed.initialize("New", "NEW", hacker, CommunityNFT.ValidationMode.STRICT_SBT);
        vm.stopPrank();
    }

    // ============================================
    // Access Control & Role Tests
    // ============================================

    function test_AccessControl_GrantMinter() public {
        vm.startPrank(owner);
        address addr = factory.deployCommunityNFT("Test", "TST", CommunityNFT.ValidationMode.TRANSFERABLE);
        nft = CommunityNFT(addr);

        // Grant Agent role
        nft.grantRole(nft.MINTER_ROLE(), agent);
        assertTrue(nft.hasRole(nft.MINTER_ROLE(), agent));
        vm.stopPrank();
    }

    function test_AccessControl_Mint_Revert_Unauthorized() public {
        vm.startPrank(owner);
        address addr = factory.deployCommunityNFT("Test", "TST", CommunityNFT.ValidationMode.TRANSFERABLE);
        nft = CommunityNFT(addr);
        vm.stopPrank();

        vm.startPrank(hacker);
        vm.expectRevert(); // AccessControl revert (custom error in OZ 5.x)
        nft.mint(hacker, "uri", false);
        vm.stopPrank();
    }

    // ============================================
    // Minting Logic Tests
    // ============================================

    function test_Mint_BatchMint_Success() public {
        vm.startPrank(owner);
        address addr = factory.deployCommunityNFT("Batch", "BCH", CommunityNFT.ValidationMode.TRANSFERABLE);
        nft = CommunityNFT(addr);

        address[] memory recipients = new address[](2);
        recipients[0] = user1;
        recipients[1] = user2;
        string[] memory uris = new string[](2);
        uris[0] = "u1";
        uris[1] = "u2";
        bool[] memory flags = new bool[](2); // Ignored in Transferable mode

        nft.batchMint(recipients, uris, flags);
        
        assertEq(nft.ownerOf(0), user1);
        assertEq(nft.ownerOf(1), user2);
        assertEq(nft.tokenURI(0), "u1");
        vm.stopPrank();
    }

    function test_Mint_BatchMint_Revert_LengthMismatch() public {
        vm.startPrank(owner);
        address addr = factory.deployCommunityNFT("Batch", "BCH", CommunityNFT.ValidationMode.TRANSFERABLE);
        nft = CommunityNFT(addr);

        address[] memory recipients = new address[](1);
        string[] memory uris = new string[](2); // Mismatch
        bool[] memory flags = new bool[](1);

        vm.expectRevert("Length mismatch");
        nft.batchMint(recipients, uris, flags);
        vm.stopPrank();
    }

    // ============================================
    // Transfer Validity Tests (The Core Logic)
    // ============================================

    function test_Transfer_STRICT_SBT() public {
        vm.startPrank(owner);
        address addr = factory.deployCommunityNFT("SBT", "SBT", CommunityNFT.ValidationMode.STRICT_SBT);
        nft = CommunityNFT(addr);
        nft.mint(user1, "sbt", false); // Flag ignored
        vm.stopPrank();

        // 1. Transfer should FAIL
        vm.startPrank(user1);
        vm.expectRevert("CommunityNFT: Soulbound token cannot be transferred");
        nft.transferFrom(user1, user2, 0);
        vm.stopPrank();

        // 2. Burn should SUCCEED
        vm.startPrank(user1);
        nft.burn(0);
        vm.expectRevert(); // Owner query for non-existent token
        nft.ownerOf(0);
        vm.stopPrank();
    }

    function test_Transfer_TRANSFERABLE() public {
        vm.startPrank(owner);
        address addr = factory.deployCommunityNFT("Trans", "TRN", CommunityNFT.ValidationMode.TRANSFERABLE);
        nft = CommunityNFT(addr);
        nft.mint(user1, "trn", true); // Flag ignored (even if true passed)
        vm.stopPrank();

        vm.startPrank(user1);
        nft.transferFrom(user1, user2, 0);
        assertEq(nft.ownerOf(0), user2);
        vm.stopPrank();
    }

    function test_Transfer_HYBRID() public {
        vm.startPrank(owner);
        address addr = factory.deployCommunityNFT("Hybrid", "HYB", CommunityNFT.ValidationMode.HYBRID);
        nft = CommunityNFT(addr);
        
        // Mint 0: Soulbound
        nft.mint(user1, "sbt", true);
        // Mint 1: Transferable
        nft.mint(user1, "movable", false);
        vm.stopPrank();

        vm.startPrank(user1);
        // Token 0 -> Fail
        vm.expectRevert("CommunityNFT: Soulbound token cannot be transferred");
        nft.transferFrom(user1, user2, 0);

        // Token 1 -> Success
        nft.transferFrom(user1, user2, 1);
        assertEq(nft.ownerOf(1), user2);
        vm.stopPrank();
    }

    // ============================================
    // Agent Workflow Integration
    // ============================================

    function test_Workflow_AI_Agent_Minting() public {
        vm.startPrank(owner);
        // 1. Deploy
        address addr = factory.deployCommunityNFT("AI", "BOT", CommunityNFT.ValidationMode.STRICT_SBT);
        nft = CommunityNFT(addr);
        
        // 2. Add AI Agent
        nft.grantRole(nft.MINTER_ROLE(), agent);
        vm.stopPrank();

        // 3. AI Agent Mints
        vm.startPrank(agent);
        nft.mint(user1, "proof_of_attendance", true);
        assertEq(nft.ownerOf(0), user1);
        vm.stopPrank();

        // 4. Verify SBT execution
        vm.startPrank(user1);
        vm.expectRevert("CommunityNFT: Soulbound token cannot be transferred");
        nft.transferFrom(user1, user2, 0);
        vm.stopPrank();
    }
}
