# MyShop

## 系统架构图

```mermaid
flowchart LR
  subgraph Offchain["Off-chain"]
    UI["前端 / 脚本 / 第三方应用"]
    RiskSvc["风控签名服务\n(RiskAllowance)"]
    SerialSvc["串号签发/校验服务\n(SerialPermit)"]
    Worker["MyShop Worker\n- Purchased 监听\n- Permit 签名 API\n- Webhook/Telegram 通知"]
    Webhook["业务后端 Webhook"]
    Tg["Telegram"]
  end

  subgraph Onchain["On-chain (EVM)"]
    Registry["Registry\n(ROLE_COMMUNITY)"]
    Shops["MyShops\n- 注册 Shop\n- 平台费率/上架费"]
    Items["MyShopItems\n- 上架 Item\n- 原子购买 buy()"]
    NFT["CommunityNFT/MockCommunityNFT\nmint(to, uri, soulbound)"]
    Action["Action 合约\n(可组合能力)"]
    PayToken["ERC20 / ETH"]
  end

  UI -->|"registerShop / addItem / buy"| Onchain
  Registry --> Shops
  Shops --> Items
  Items -->|"mint"| NFT
  Items -->|"execute"| Action
  UI -->|"请求签名"| RiskSvc
  UI -->|"请求串号+签名"| SerialSvc
  Worker -->|"监听 Purchased"| Items
  Worker --> Webhook
  Worker --> Tg
  UI -->|"可选: 直接调 Worker 的 Permit API"| Worker
  PayToken --> Items
```

## 分模块架构图（合约）

```mermaid
flowchart TB
  subgraph Contracts["contracts/src"]
    Shops["MyShops"]
    Items["MyShopItems"]
    SaleA["sales/APNTsSale"]
    SaleG["sales/GTokenSale"]
    ActMint["actions/MintERC20Action"]
    ActEvent["actions/EmitEventAction"]
    MRegistry["mocks/MockRegistry"]
    MToken["mocks/MockERC20Mintable"]
    MNFT["mocks/MockCommunityNFT"]
  end

  Shops -->|"依赖 registry.hasRole"| MRegistry
  Items -->|"读取 Shop 配置"| Shops
  Items -->|"平台费/收款"| MToken
  Items -->|"mint NFT"| MNFT
  Items -->|"action 白名单 + execute"| ActMint
  Items -->|"action 白名单 + execute"| ActEvent
  SaleA --> MToken
  SaleG --> MToken
```

## 流转关系（关键流程）

### 1) 上架 addItem：默认风控 + 可选风险签名放宽上限

```mermaid
sequenceDiagram
  participant ShopOwner as Shop Owner
  participant Risk as Risk Signer
  participant Items as MyShopItems
  participant Shops as MyShops
  participant APNTs as aPNTs(ERC20)
  participant Treasury as Platform Treasury

  Note over ShopOwner,Items: 如果该 shop item 数超过默认阈值，需要 RiskAllowance 签名
  ShopOwner->>Risk: 请求 RiskAllowance(shopOwner,maxItems,deadline,nonce)
  Risk-->>ShopOwner: signature
  ShopOwner->>APNTs: approve(MyShopItems, listingFee)
  ShopOwner->>Items: addItem(params + signature?)
  Items->>Shops: 读取平台费率/上架费配置
  Items->>APNTs: transferFrom(shopOwner, Treasury, listingFee)
  Items-->>ShopOwner: itemId
```

### 2) 购买 buy：串号签名（Mode A）+ 原子收款/分润/NFT/Action

```mermaid
sequenceDiagram
  participant Buyer as Buyer
  participant Serial as Serial Signer
  participant Items as MyShopItems
  participant Shops as MyShops
  participant Pay as PayToken(ERC20/ETH)
  participant ShopTreasury as Shop Treasury
  participant Treasury as Platform Treasury
  participant NFT as CommunityNFT
  participant Action as Action Contract

  Note over Buyer,Serial: requiresSerial=true 时必须提供 SerialPermit
  Buyer->>Serial: 请求 SerialPermit(itemId,buyer,serialHash,deadline,nonce)
  Serial-->>Buyer: signature
  Buyer->>Pay: approve(MyShopItems, amount)
  Buyer->>Items: buy(itemId,qty,recipient, extraData(serialHash,deadline,nonce,signature))
  Items->>Items: 校验 SerialPermit + nonce 未使用
  Items->>Shops: 读取 feeBps / treasury
  Items->>Pay: transferFrom(buyer, Treasury, platformFee)
  Items->>Pay: transferFrom(buyer, ShopTreasury, netAmount)
  Items->>NFT: mint(recipient, tokenURI, soulbound)
  Items->>Action: execute(buyer,recipient,itemId,shopId,qty,actionData,extraData)
  Items-->>Buyer: firstTokenId
```

## 文档

- 架构与流程说明：[docs/architecture.md](file:///Users/jason/Dev/crypto-projects/MyShop/docs/architecture.md)
- Worker（监听/签名/通知）使用说明：[docs/worker.md](file:///Users/jason/Dev/crypto-projects/MyShop/docs/worker.md)
