export const myShopItemsAbi = [
  {
    type: "event",
    name: "Purchased",
    inputs: [
      { indexed: true, name: "itemId", type: "uint256" },
      { indexed: true, name: "shopId", type: "uint256" },
      { indexed: true, name: "buyer", type: "address" },
      { indexed: false, name: "recipient", type: "address" },
      { indexed: false, name: "quantity", type: "uint256" },
      { indexed: false, name: "payToken", type: "address" },
      { indexed: false, name: "payAmount", type: "uint256" },
      { indexed: false, name: "platformFeeAmount", type: "uint256" },
      { indexed: false, name: "serialHash", type: "bytes32" },
      { indexed: false, name: "firstTokenId", type: "uint256" }
    ]
  },
  {
    type: "function",
    name: "itemCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "shops",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
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
  },
  {
    type: "function",
    name: "usedNonces",
    stateMutability: "view",
    inputs: [
      { name: "", type: "address" },
      { name: "", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
];

export const myShopsAbi = [
  {
    type: "function",
    name: "shopCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
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
  }
];
