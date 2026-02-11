pragma solidity ^0.8.20;

contract EmitEventAction {
    event ActionEvent(
        address indexed buyer,
        address indexed recipient,
        uint256 indexed itemId,
        uint256 shopId,
        uint256 quantity,
        bytes actionData,
        bytes extraData
    );

    function execute(
        address buyer,
        address recipient,
        uint256 itemId,
        uint256 shopId,
        uint256 quantity,
        bytes calldata actionData,
        bytes calldata extraData
    ) external payable {
        emit ActionEvent(buyer, recipient, itemId, shopId, quantity, actionData, extraData);
    }
}

