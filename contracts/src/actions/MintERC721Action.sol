pragma solidity ^0.8.20;

interface IERC721WithMintURI {
    function mint(address to, string calldata uri) external returns (uint256);
}

interface ICommunityNFTMintV1 {
    function mint(address to, string calldata uri, bool soulbound) external returns (uint256);
}

interface IERC721TemplateMinter {
    function mintFromTemplate(address to, uint256 templateId) external returns (uint256);
}

contract MintERC721Action {
    error MintFailed();

    // actionData encoding:
    // abi.encode(address nft, bytes payload)
    // where payload is either:
    // - abi.encode(string tokenURI)     // mint by URI
    // - abi.encode(uint256 templateId)  // mint by template
    function execute(
        address,
        address recipient,
        uint256,
        uint256,
        uint256 quantity,
        bytes calldata actionData,
        bytes calldata
    ) external payable {
        (address nft, bytes memory payload) = abi.decode(actionData, (address, bytes));
        if (quantity == 0) quantity = 1;

        for (uint256 i = 0; i < quantity; i++) {
            bool success = false;

            if (payload.length == 32) {
                // try mint by templateId
                uint256 templateId = abi.decode(payload, (uint256));
                try IERC721TemplateMinter(nft).mintFromTemplate(recipient, templateId) returns (uint256) {
                    success = true;
                } catch {}
            }

            if (!success) {
                // try community NFT v1: (to, uri, soulbound=false)
                try ICommunityNFTMintV1(nft).mint(recipient, abi.decode(payload, (string)), false) returns (uint256) {
                    success = true;
                } catch {
                    // try generic ERC721 mint with uri
                    try IERC721WithMintURI(nft).mint(recipient, abi.decode(payload, (string))) returns (uint256) {
                        success = true;
                    } catch {}
                }
            }

            if (!success) revert MintFailed();
        }
    }
}
