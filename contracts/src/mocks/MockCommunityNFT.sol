pragma solidity ^0.8.20;

contract MockCommunityNFT {
    uint256 public nextTokenId;
    mapping(uint256 => address) public ownerOf;
    mapping(uint256 => string) public tokenURI;
    mapping(uint256 => bool) public isSoulbound;

    event Minted(address indexed to, uint256 indexed tokenId, string uri, bool soulbound);

    function mint(address to, string calldata uri, bool soulbound) external returns (uint256 tokenId) {
        tokenId = ++nextTokenId;
        ownerOf[tokenId] = to;
        tokenURI[tokenId] = uri;
        isSoulbound[tokenId] = soulbound;
        emit Minted(to, tokenId, uri, soulbound);
    }
}

