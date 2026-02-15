pragma solidity ^0.8.20;

import {IERC20} from "forge-std/interfaces/IERC20.sol";

interface IERC20Mintable is IERC20 {
    function mint(address to, uint256 amount) external;
}

contract APNTsSale {
    uint256 public constant BPS_DENOMINATOR = 10_000;

    address public owner;
    address public treasury;
    address public apnts;

    bool public paused;

    mapping(address => bool) public acceptedPayTokens;
    mapping(address => uint256) public ratePerPayToken;
    mapping(address => PendingRate) public pendingRate;

    uint256 public rateUpdateDelay;
    uint256 public maxRateChangeBps;

    uint256 public totalMinted;
    uint256 public dailyMintCap;
    uint256 public perTxMintCap;
    mapping(uint256 => uint256) public mintedByDay;

    struct PendingRate {
        uint256 rate;
        uint256 eta;
    }

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event TreasuryUpdated(address indexed treasury);
    event Paused(bool paused);
    event PayTokenUpdated(address indexed token, bool accepted, uint256 ratePerToken);
    event PayTokenRateQueued(address indexed token, uint256 ratePerToken, uint256 eta);
    event RateUpdateDelaySet(uint256 delay);
    event MaxRateChangeBpsSet(uint256 bps);
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
    error RateUpdateNotReady();
    error RateUpdateMissing();
    error RateChangeTooLarge();
    error InvalidBps();

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
        if (!accepted) {
            ratePerPayToken[token] = 0;
            delete pendingRate[token];
            emit PayTokenUpdated(token, accepted, 0);
            return;
        }
        if (ratePerToken == 0) {
            ratePerPayToken[token] = 0;
            delete pendingRate[token];
            emit PayTokenUpdated(token, accepted, 0);
            return;
        }
        if (rateUpdateDelay == 0) {
            _applyRate(token, ratePerToken);
            emit PayTokenUpdated(token, accepted, ratePerToken);
            return;
        }
        _queueRate(token, ratePerToken);
        emit PayTokenUpdated(token, accepted, ratePerPayToken[token]);
    }

    function setCaps(uint256 dailyMintCap_, uint256 perTxMintCap_) external onlyOwner {
        dailyMintCap = dailyMintCap_;
        perTxMintCap = perTxMintCap_;
        emit CapsUpdated(dailyMintCap_, perTxMintCap_);
    }

    function setRateUpdateDelay(uint256 delay) external onlyOwner {
        rateUpdateDelay = delay;
        emit RateUpdateDelaySet(delay);
    }

    function setMaxRateChangeBps(uint256 bps) external onlyOwner {
        if (bps > BPS_DENOMINATOR) revert InvalidBps();
        maxRateChangeBps = bps;
        emit MaxRateChangeBpsSet(bps);
    }

    function applyPayTokenRate(address token) external onlyOwner {
        PendingRate memory pending = pendingRate[token];
        if (pending.rate == 0) revert RateUpdateMissing();
        if (pending.eta > block.timestamp) revert RateUpdateNotReady();
        _applyRate(token, pending.rate);
        emit PayTokenUpdated(token, acceptedPayTokens[token], ratePerPayToken[token]);
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

    function _queueRate(address token, uint256 newRate) internal {
        _enforceRateChange(token, newRate);
        uint256 eta = block.timestamp + rateUpdateDelay;
        pendingRate[token] = PendingRate({rate: newRate, eta: eta});
        emit PayTokenRateQueued(token, newRate, eta);
    }

    function _applyRate(address token, uint256 newRate) internal {
        _enforceRateChange(token, newRate);
        ratePerPayToken[token] = newRate;
        delete pendingRate[token];
    }

    function _enforceRateChange(address token, uint256 newRate) internal view {
        uint256 limitBps = maxRateChangeBps;
        uint256 currentRate = ratePerPayToken[token];
        if (limitBps == 0 || currentRate == 0) return;
        uint256 diff = currentRate > newRate ? currentRate - newRate : newRate - currentRate;
        if (diff * BPS_DENOMINATOR > currentRate * limitBps) revert RateChangeTooLarge();
    }
}
