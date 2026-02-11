pragma solidity ^0.8.20;

interface IERC20Mintable {
    function mint(address to, uint256 amount) external;
}

contract MintERC20Action {
    function execute(
        address,
        address recipient,
        uint256,
        uint256,
        uint256 quantity,
        bytes calldata actionData,
        bytes calldata
    ) external payable {
        (address token, uint256 amountPerUnit) = abi.decode(actionData, (address, uint256));
        IERC20Mintable(token).mint(recipient, amountPerUnit * quantity);
    }
}

