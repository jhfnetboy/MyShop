pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";

import {APNTsSale} from "../src/sales/APNTsSale.sol";
import {GTokenSale} from "../src/sales/GTokenSale.sol";
import {MockERC20Mintable} from "../src/mocks/MockERC20Mintable.sol";

contract SalesTest is Test {
    address internal treasury = address(0xBEEF);
    address internal buyer = address(0xB0A7);
    address internal recipient = address(0xF00D);

    MockERC20Mintable internal apnts;
    MockERC20Mintable internal gToken;
    MockERC20Mintable internal usdc;
    MockERC20Mintable internal wbtc;
    MockERC20Mintable internal tbtc;

    APNTsSale internal apntsSale;
    GTokenSale internal gTokenSale;

    function setUp() external {
        apnts = new MockERC20Mintable("aPNTs", "aPNTs", 18);
        gToken = new MockERC20Mintable("GToken", "GT", 18);
        usdc = new MockERC20Mintable("USDC", "USDC", 6);
        wbtc = new MockERC20Mintable("WBTC", "WBTC", 8);
        tbtc = new MockERC20Mintable("TBTC", "TBTC", 18);

        apntsSale = new APNTsSale(address(apnts), treasury);
        gTokenSale = new GTokenSale(address(gToken), treasury);

        usdc.mint(buyer, 1_000_000_000);
        wbtc.mint(buyer, 10_000_000_000);
        tbtc.mint(buyer, 1_000 ether);

        vm.prank(buyer);
        usdc.approve(address(apntsSale), type(uint256).max);
        vm.prank(buyer);
        wbtc.approve(address(apntsSale), type(uint256).max);

        vm.prank(buyer);
        wbtc.approve(address(gTokenSale), type(uint256).max);
        vm.prank(buyer);
        tbtc.approve(address(gTokenSale), type(uint256).max);

        apnts.mint(buyer, 10_000 ether);
        vm.prank(buyer);
        apnts.approve(address(gTokenSale), type(uint256).max);
    }

    function test_apntsSale_buyWithToken_usdc() external {
        apntsSale.setPayToken(address(usdc), true, 1000);

        uint256 treasuryBefore = usdc.balanceOf(treasury);
        uint256 outBefore = apnts.balanceOf(recipient);

        vm.prank(buyer);
        uint256 out = apntsSale.buyWithToken(address(usdc), 1_000_000, recipient, 0);

        assertEq(out, 1_000_000 * 1000);
        assertEq(usdc.balanceOf(treasury) - treasuryBefore, 1_000_000);
        assertEq(apnts.balanceOf(recipient) - outBefore, out);
        assertEq(apntsSale.totalMinted(), out);
    }

    function test_apntsSale_buyWithEth() external {
        apntsSale.setPayToken(address(0), true, 200);

        vm.deal(buyer, 1 ether);
        uint256 outBefore = apnts.balanceOf(recipient);

        vm.prank(buyer);
        uint256 out = apntsSale.buyWithEth{value: 0.5 ether}(recipient, 0);

        assertEq(out, 0.5 ether * 200);
        assertEq(apnts.balanceOf(recipient) - outBefore, out);
    }

    function test_apntsSale_enforcesCaps() external {
        apntsSale.setPayToken(address(usdc), true, 1000);
        apntsSale.setCaps(5000, 0);

        vm.prank(buyer);
        apntsSale.buyWithToken(address(usdc), 5, recipient, 0);

        vm.prank(buyer);
        vm.expectRevert(APNTsSale.MintCapExceeded.selector);
        apntsSale.buyWithToken(address(usdc), 1, recipient, 0);
    }

    function test_gTokenSale_buyWithToken_wbtc() external {
        gTokenSale.setPayToken(address(wbtc), true, 1_000_000);

        uint256 treasuryBefore = wbtc.balanceOf(treasury);
        uint256 outBefore = gToken.balanceOf(recipient);

        vm.prank(buyer);
        uint256 out = gTokenSale.buyWithToken(address(wbtc), 100_000_000, recipient, 0);

        assertEq(out, 100_000_000 * 1_000_000);
        assertEq(wbtc.balanceOf(treasury) - treasuryBefore, 100_000_000);
        assertEq(gToken.balanceOf(recipient) - outBefore, out);
    }

    function test_gTokenSale_buyWithToken_tbtc() external {
        gTokenSale.setPayToken(address(tbtc), true, 10);

        uint256 outBefore = gToken.balanceOf(recipient);
        vm.prank(buyer);
        uint256 out = gTokenSale.buyWithToken(address(tbtc), 1 ether, recipient, 0);

        assertEq(out, 1 ether * 10);
        assertEq(gToken.balanceOf(recipient) - outBefore, out);
    }

    function test_gTokenSale_buyWithToken_apnts() external {
        gTokenSale.setPayToken(address(apnts), true, 2);

        uint256 outBefore = gToken.balanceOf(recipient);
        uint256 apntsTreasuryBefore = apnts.balanceOf(treasury);

        vm.prank(buyer);
        uint256 out = gTokenSale.buyWithToken(address(apnts), 50 ether, recipient, 0);

        assertEq(out, 100 ether);
        assertEq(gToken.balanceOf(recipient) - outBefore, out);
        assertEq(apnts.balanceOf(treasury) - apntsTreasuryBefore, 50 ether);
    }

    function test_gTokenSale_enforcesCap() external {
        gTokenSale.setPayToken(address(usdc), true, gTokenSale.CAP());
        usdc.mint(buyer, 2);
        vm.prank(buyer);
        usdc.approve(address(gTokenSale), 2);

        vm.prank(buyer);
        gTokenSale.buyWithToken(address(usdc), 1, recipient, 0);

        vm.prank(buyer);
        vm.expectRevert(GTokenSale.MintCapExceeded.selector);
        gTokenSale.buyWithToken(address(usdc), 1, recipient, 0);
    }
}
