pragma solidity ^0.8.20;

import {IERC20} from "forge-std/interfaces/IERC20.sol";

interface IERC20Mintable is IERC20 {
    function mint(address to, uint256 amount) external;
}

contract APNTsSale {
    address public owner;
    address public treasury;
    address public apnts;

    bool public paused;

    mapping(address => bool) public acceptedPayTokens;
    mapping(address => uint256) public ratePerPayToken;

    uint256 public totalMinted;
    uint256 public dailyMintCap;
    uint256 public perTxMintCap;
    mapping(uint256 => uint256) public mintedByDay;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event TreasuryUpdated(address indexed treasury);
    event Paused(bool paused);
    event PayTokenUpdated(address indexed token, bool accepted, uint256 ratePerToken);
    event CapsUpdated(uint256 dailyMintCap, uint256 perTxMintCap);
    event Purchased(
        address indexed payer,
        address indexed recipient,
        address indexed payToken,
        uint256 payAmount,
        uint256 mintAmount
    );

    error NotOwner();
    error InvalidAddress();
    error PausedError();
    error UnsupportedPayToken();
    error InvalidPayment();
    error TransferFailed();
    error RateNotSet();
    error MintCapExceeded();

    constructor(address apnts_, address treasury_) {
        if (apnts_ == address(0) || treasury_ == address(0)) revert InvalidAddress();
        owner = msg.sender;
        apnts = apnts_;
        treasury = treasury_;
        emit OwnershipTransferred(address(0), msg.sender);
        emit TreasuryUpdated(treasury_);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier notPaused() {
        if (paused) revert PausedError();
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert InvalidAddress();
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit Paused(paused_);
    }

    function setPayToken(address token, bool accepted, uint256 ratePerToken) external onlyOwner {
        acceptedPayTokens[token] = accepted;
        ratePerPayToken[token] = ratePerToken;
        emit PayTokenUpdated(token, accepted, ratePerToken);
    }

    function setCaps(uint256 dailyMintCap_, uint256 perTxMintCap_) external onlyOwner {
        dailyMintCap = dailyMintCap_;
        perTxMintCap = perTxMintCap_;
        emit CapsUpdated(dailyMintCap_, perTxMintCap_);
    }

    function buyWithEth(address recipient, uint256 minOut) external payable notPaused returns (uint256 mintAmount) {
        mintAmount = _buy(address(0), msg.value, recipient, minOut);
    }

    function buyWithToken(address payToken, uint256 payAmount, address recipient, uint256 minOut)
        external
        notPaused
        returns (uint256 mintAmount)
    {
        mintAmount = _buy(payToken, payAmount, recipient, minOut);
    }

    function _buy(address payToken, uint256 payAmount, address recipient, uint256 minOut)
        internal
        returns (uint256 mintAmount)
    {
        if (recipient == address(0)) revert InvalidAddress();
        if (!acceptedPayTokens[payToken]) revert UnsupportedPayToken();
        uint256 rate = ratePerPayToken[payToken];
        if (rate == 0) revert RateNotSet();

        if (payToken == address(0)) {
            if (payAmount == 0 || msg.value != payAmount) revert InvalidPayment();
            (bool ok,) = treasury.call{value: payAmount}("");
            if (!ok) revert TransferFailed();
        } else {
            if (msg.value != 0) revert InvalidPayment();
            IERC20 token = IERC20(payToken);
            bool okPull = token.transferFrom(msg.sender, address(this), payAmount);
            if (!okPull) revert TransferFailed();
            bool okSend = token.transfer(treasury, payAmount);
            if (!okSend) revert TransferFailed();
        }

        mintAmount = payAmount * rate;
        if (mintAmount < minOut) revert InvalidPayment();

        uint256 day = block.timestamp / 1 days;
        if (perTxMintCap != 0 && mintAmount > perTxMintCap) revert MintCapExceeded();
        uint256 nextDayMint = mintedByDay[day] + mintAmount;
        if (dailyMintCap != 0 && nextDayMint > dailyMintCap) revert MintCapExceeded();
        mintedByDay[day] = nextDayMint;

        IERC20Mintable(apnts).mint(recipient, mintAmount);
        totalMinted += mintAmount;

        emit Purchased(msg.sender, recipient, payToken, payAmount, mintAmount);
    }
}

