import { getAddress, isAddress } from "viem";

export const myShopsAbi = [
  {
    type: "function",
    name: "transferOwnership",
    stateMutability: "nonpayable",
    inputs: [{ name: "newOwner", type: "address" }],
    outputs: []
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "registry",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
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
    name: "platformTreasury",
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
    name: "platformFeeBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }]
  },
  {
    type: "function",
    name: "shopCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "setRegistry",
    stateMutability: "nonpayable",
    inputs: [{ name: "registry_", type: "address" }],
    outputs: []
  },
  {
    type: "function",
    name: "setPlatformTreasury",
    stateMutability: "nonpayable",
    inputs: [{ name: "treasury", type: "address" }],
    outputs: []
  },
  {
    type: "function",
    name: "setListingFee",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "setPlatformFee",
    stateMutability: "nonpayable",
    inputs: [{ name: "feeBps", type: "uint16" }],
    outputs: []
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
    name: "transferOwnership",
    stateMutability: "nonpayable",
    inputs: [{ name: "newOwner", type: "address" }],
    outputs: []
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "riskSigner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "serialSigner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "setRiskSigner",
    stateMutability: "nonpayable",
    inputs: [{ name: "signer", type: "address" }],
    outputs: []
  },
  {
    type: "function",
    name: "setSerialSigner",
    stateMutability: "nonpayable",
    inputs: [{ name: "signer", type: "address" }],
    outputs: []
  },
  {
    type: "function",
    name: "setActionAllowed",
    stateMutability: "nonpayable",
    inputs: [
      { name: "action", type: "address" },
      { name: "allowed", type: "bool" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "allowedActions",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bool" }]
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

export const SHOP_ROLE_SHOP_ADMIN = 1;
export const SHOP_ROLE_ITEM_MAINTAINER = 2;
export const SHOP_ROLE_ITEM_EDITOR = 4;
export const SHOP_ROLE_ITEM_ACTION_EDITOR = 8;

export function decodeShopRolesMask(rolesMask) {
  const mask = Number(rolesMask ?? 0);
  const labels = [];
  if ((mask & SHOP_ROLE_SHOP_ADMIN) !== 0) labels.push("shopAdmin(1)");
  if ((mask & SHOP_ROLE_ITEM_MAINTAINER) !== 0) labels.push("itemMaintainer(2)");
  if ((mask & SHOP_ROLE_ITEM_EDITOR) !== 0) labels.push("itemEditor(4)");
  if ((mask & SHOP_ROLE_ITEM_ACTION_EDITOR) !== 0) labels.push("itemActionEditor(8)");
  return {
    rolesMask: mask,
    labels,
    isShopAdmin: (mask & SHOP_ROLE_SHOP_ADMIN) !== 0,
    isItemMaintainer: (mask & SHOP_ROLE_ITEM_MAINTAINER) !== 0,
    isItemEditor: (mask & SHOP_ROLE_ITEM_EDITOR) !== 0,
    isItemActionEditor: (mask & SHOP_ROLE_ITEM_ACTION_EDITOR) !== 0
  };
}

export function createMyShopReadClient({ publicClient, shopsAddress, itemsAddress }) {
  const shops = isAddress(shopsAddress) ? getAddress(shopsAddress) : null;
  const items = isAddress(itemsAddress) ? getAddress(itemsAddress) : null;

  async function getProtocolOwners() {
    const owners = { shopsOwner: null, itemsOwner: null };

    if (shops) {
      const o = await publicClient.readContract({
        address: shops,
        abi: myShopsAbi,
        functionName: "owner",
        args: []
      });
      owners.shopsOwner = getAddress(o);
    }

    if (items) {
      const o = await publicClient.readContract({
        address: items,
        abi: myShopItemsAbi,
        functionName: "owner",
        args: []
      });
      owners.itemsOwner = getAddress(o);
    }

    return owners;
  }

  function isProtocolOwner(owners, actor) {
    const a = actor ? getAddress(actor) : null;
    if (!a) return false;
    return (owners?.shopsOwner && owners.shopsOwner === a) || (owners?.itemsOwner && owners.itemsOwner === a);
  }

  async function getShopOwner(shopId) {
    if (!shops) throw new Error("Invalid shopsAddress");
    const shop = await publicClient.readContract({
      address: shops,
      abi: myShopsAbi,
      functionName: "shops",
      args: [shopId]
    });
    const rawOwner = shop && typeof shop === "object" ? (shop.owner ?? shop[0]) : null;
    if (!rawOwner) throw new Error("Invalid shops() response");
    return getAddress(rawOwner);
  }

  async function getShopRolesMask(shopId, actor) {
    if (!shops) throw new Error("Invalid shopsAddress");
    const a = getAddress(actor);
    const roles = await publicClient.readContract({
      address: shops,
      abi: myShopsAbi,
      functionName: "shopRoles",
      args: [shopId, a]
    });
    return Number(BigInt(roles));
  }

  return {
    shopsAddress: shops,
    itemsAddress: items,
    getProtocolOwners,
    isProtocolOwner,
    getShopOwner,
    getShopRolesMask
  };
}
