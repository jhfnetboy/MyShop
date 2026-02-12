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

- 架构与流程说明：[docs/architecture.md](docs/architecture.md)
- 五步走规划与进度：[Solution.md](Solution.md)
- Shop 管理模块设计：[docs/shop_management.md](docs/shop_management.md)
- Worker（监听/签名/通知）使用说明：[docs/worker.md](docs/worker.md)
- 本地一键演示：[docs/demo_local.md](docs/demo_local.md)
- 前端最小闭环：[frontend/README.md](frontend/README.md)
- Worker 快速说明：[worker/README.md](worker/README.md)
- 合约开发（Foundry）：[contracts/README.md](contracts/README.md)
- Demo 脚本入口：[scripts/demo_local.sh](scripts/demo_local.sh)
- Reference（对齐用）：[reference/](reference/)

## 功能列表（feat）

- **Shop**
  - 社区注册 Shop（依赖 `Registry.hasRole(ROLE_COMMUNITY)`）
  - Shop 更新与暂停（owner/平台 owner 权限）
- **Item（上架/管理）**
  - ShopOwner 上架商品（listing fee 可配置）
  - 默认风控：单店默认最多 5 个 item；可用 `RiskAllowance` 签名放宽上限
  - Item 上下架（active 开关）
  - Action 白名单：平台 owner 允许/禁止可执行的 action 合约
- **购买（原子闭环）**
  - `buy()` 原子完成：收款 + 平台费分润 + mint NFT + execute action
  - 可选串号校验：`requiresSerial=true` 时必须提供 `SerialPermit`（EIP-712 + nonce + deadline）
- **售卖合约（独立模块）**
  - aPNTsSale / GTokenSale：支持 cap/limits、可暂停、事件上报
- **Off-chain Worker**
  - Purchased 事件监听与 payload enrich（补充 item/shop 链上信息）
  - Webhook 转发（可选）与 Telegram 通知（可选）
  - Permit 服务：`/serial-permit` 与 `/risk-allowance`
  - Query API：`/shops` `/items` `/purchases` + 内存索引（可配置 `source=index|chain`）
- **一键演示 & 最小前端**
  - 一条命令本地部署 + 购买 + 输出 Purchased payload（可选附带 Query API 校验）
  - Vite 最小前端：直连合约完成 registerShop / addItem / buy（可选对接 Worker）
