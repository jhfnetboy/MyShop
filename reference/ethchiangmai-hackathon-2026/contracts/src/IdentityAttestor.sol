pragma solidity ^0.8.20;

contract IdentityAttestor {
    mapping(address => bool) public registered;
    function register(address user) external {
        registered[user] = true;
    }
    function verifyIdentity(address user) external view returns (bool) {
        return registered[user];
    }
    function hasParticipation(address user) external view returns (bool) {
        return registered[user];
    }
}
