export const myShopItemsAbi = [
  {
    type: "event",
    name: "Purchased",
    inputs: [
      { indexed: true, name: "itemId", type: "uint256" },
      { indexed: false, name: "shopId", type: "uint256" },
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
    name: "usedNonces",
    stateMutability: "view",
    inputs: [
      { name: "", type: "address" },
      { name: "", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
];

