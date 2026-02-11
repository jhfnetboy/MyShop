export const myShopsAbi = [
  {
    type: "function",
    name: "registerShop",
    stateMutability: "nonpayable",
    inputs: [
      { name: "treasury", type: "address" },
      { name: "metadataHash", type: "bytes32" }
    ],
    outputs: [{ name: "shopId", type: "uint256" }]
  },
  {
    type: "function",
    name: "shops",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "owner", type: "address" },
      { name: "treasury", type: "address" },
      { name: "metadataHash", type: "bytes32" },
      { name: "paused", type: "bool" }
    ]
  },
  {
    type: "function",
    name: "listingFeeToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "listingFeeAmount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  }
];

export const myShopItemsAbi = [
  {
    type: "function",
    name: "addItem",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "p",
        type: "tuple",
        components: [
          { name: "shopId", type: "uint256" },
          { name: "payToken", type: "address" },
          { name: "unitPrice", type: "uint256" },
          { name: "nftContract", type: "address" },
          { name: "soulbound", type: "bool" },
          { name: "tokenURI", type: "string" },
          { name: "action", type: "address" },
          { name: "actionData", type: "bytes" },
          { name: "requiresSerial", type: "bool" },
          { name: "maxItems", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "signature", type: "bytes" }
        ]
      }
    ],
    outputs: [{ name: "itemId", type: "uint256" }]
  },
  {
    type: "function",
    name: "buy",
    stateMutability: "payable",
    inputs: [
      { name: "itemId", type: "uint256" },
      { name: "quantity", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "extraData", type: "bytes" }
    ],
    outputs: [{ name: "firstTokenId", type: "uint256" }]
  },
  {
    type: "function",
    name: "items",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "shopId", type: "uint256" },
      { name: "payToken", type: "address" },
      { name: "unitPrice", type: "uint256" },
      { name: "nftContract", type: "address" },
      { name: "soulbound", type: "bool" },
      { name: "tokenURI", type: "string" },
      { name: "action", type: "address" },
      { name: "actionData", type: "bytes" },
      { name: "requiresSerial", type: "bool" },
      { name: "active", type: "bool" }
    ]
  }
];

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
];

