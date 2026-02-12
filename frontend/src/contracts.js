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
  },
  {
    type: "function",
    name: "updateShop",
    stateMutability: "nonpayable",
    inputs: [
      { name: "shopId", type: "uint256" },
      { name: "treasury", type: "address" },
      { name: "metadataHash", type: "bytes32" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "setShopPaused",
    stateMutability: "nonpayable",
    inputs: [
      { name: "shopId", type: "uint256" },
      { name: "paused", type: "bool" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "setShopRoles",
    stateMutability: "nonpayable",
    inputs: [
      { name: "shopId", type: "uint256" },
      { name: "operator", type: "address" },
      { name: "roles", type: "uint8" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "shopRoles",
    stateMutability: "view",
    inputs: [
      { name: "", type: "uint256" },
      { name: "", type: "address" }
    ],
    outputs: [{ name: "", type: "uint8" }]
  },
  {
    type: "function",
    name: "ROLE_ITEM_MAINTAINER",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }]
  },
  {
    type: "function",
    name: "ROLE_ITEM_EDITOR",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }]
  },
  {
    type: "function",
    name: "ROLE_ITEM_ACTION_EDITOR",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }]
  }
];

export const myShopItemsAbi = [
  {
    type: "function",
    name: "itemCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
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
  },
  {
    type: "function",
    name: "setItemActive",
    stateMutability: "nonpayable",
    inputs: [
      { name: "itemId", type: "uint256" },
      { name: "active", type: "bool" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "updateItem",
    stateMutability: "nonpayable",
    inputs: [
      { name: "itemId", type: "uint256" },
      {
        name: "p",
        type: "tuple",
        components: [
          { name: "payToken", type: "address" },
          { name: "unitPrice", type: "uint256" },
          { name: "nftContract", type: "address" },
          { name: "soulbound", type: "bool" },
          { name: "tokenURI", type: "string" },
          { name: "requiresSerial", type: "bool" }
        ]
      }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "updateItemAction",
    stateMutability: "nonpayable",
    inputs: [
      { name: "itemId", type: "uint256" },
      { name: "action", type: "address" },
      { name: "actionData", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "addItemPageVersion",
    stateMutability: "nonpayable",
    inputs: [
      { name: "itemId", type: "uint256" },
      { name: "uri", type: "string" },
      { name: "contentHash", type: "bytes32" }
    ],
    outputs: [{ name: "version", type: "uint256" }]
  },
  {
    type: "function",
    name: "setItemDefaultPageVersion",
    stateMutability: "nonpayable",
    inputs: [
      { name: "itemId", type: "uint256" },
      { name: "version", type: "uint256" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "itemPageCount",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "itemDefaultPageVersion",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "getItemPage",
    stateMutability: "view",
    inputs: [
      { name: "itemId", type: "uint256" },
      { name: "version", type: "uint256" }
    ],
    outputs: [
      { name: "contentHash", type: "bytes32" },
      { name: "uri", type: "string" }
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
