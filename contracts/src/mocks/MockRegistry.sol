pragma solidity ^0.8.20;

contract MockRegistry {
    mapping(bytes32 => mapping(address => bool)) public hasRole;

    function setHasRole(bytes32 role, address account, bool value) external {
        hasRole[role][account] = value;
    }
}

