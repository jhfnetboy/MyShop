# MyShop Solution（整体方案与整合设计）

本文目标：把我之前对你问题的所有回答与设计统一沉淀为一份可 review 的整体方案，并在此基础上进一步完善架构与演进路径。本文不写代码，只描述目录、合约/前端/API/SaaS 整合边界、原子操作设计、风控与可观测性，以及我们需要搬运进来的参考代码位置。

---

## 0. 你的原始需求（复述与约束）

- MyShop 作为主要目录，包含：
  - 合约目录（EVM 合约，包含 MyShop 协议合约、aPNTs/GToken 售卖合约等）
  - 前端目录（MyShop 广场，先直接与合约交互）
- 初期前端直连合约；稳定后提取 API，并整合到 `aastar-sdk`（包含稳定后的合约地址同步）。
- 一开始需要整合多个 repo 的资产，但不写业务代码，先完成初始化设计与整合设计；同时需要把“参考代码”搬过来（黑客松 repo 的 nft 与 contracts，以及 Telegram bot 自动 mint 的部分）。
- 需要两套售卖合约：
  - aPNTs：utility token，不限量，但不可滥发；必须明确记录、风险评估页面与风控机制。
  - GToken：总量上限 21,000,000；售卖规则限制支付币种与铸币权限。
- MyShop 广场（前端）要从 registry 里现有 GToken Sale 页面提取并升级。
- 任何社区（必须已是 AAStar 的 Community）才可以在 MyShops 合约注册新 shop，销售 NFT 形式的数字商品：
  - 例如：50 aPNTs NFT 卡、10 GToken 纪念卡
  - NFT 创建参考黑客松 repo 的 nft 合约
  - 购买 NFT 后执行自定义动作（ItemAction），例如购买 50 aPNTs NFT 卡后：mint NFT + mint 50 aPNTs 到购买账户，必须原子成功（同一笔交易）
  - 动作还包括：生成序列号（可接入外部 API / 随机串号）、Telegram 通知等
- MyShop 要安装 `aastar-sdk`，通过 API/SDK 完成社区注册启动功能，包括购买 aPNTs、购买 GToken（在 shop 与 item 合约发生），注册社区等（在 registry 等合约发生）；支持“一步完成”或“购买与注册分开”。
- 售卖支付约束：
  - GToken 售卖：接受 ETH、WBTC/TBTC、aPNTs
  - aPNTs 售卖：接受 USDT、USDC、ETH、WBTC/TBTC
- 安全约束：不能把私钥与 key 提交到 GitHub。

---

## 1. 当前已整合到 MyShop 的参考代码（用于后续抽取）

黑客松 repo 的参考实现已搬到 MyShop 的 reference 目录（只作为参考源，后续再抽到正式模块）：

- 合约参考：
  - [CommunityNFT.sol](file:///Users/jason/Dev/crypto-projects/MyShop/reference/ethchiangmai-hackathon-2026/contracts/src/CommunityNFT.sol)
  - [CommunityNFTFactory.sol](file:///Users/jason/Dev/crypto-projects/MyShop/reference/ethchiangmai-hackathon-2026/contracts/src/CommunityNFTFactory.sol)
  - 以及 foundry 脚本与测试：`reference/ethchiangmai-hackathon-2026/contracts/script`、`contracts/test`
- Telegram bot + 自动 mint 参考：
  - [bot.py](file:///Users/jason/Dev/crypto-projects/MyShop/reference/ethchiangmai-hackathon-2026/services/bot/bot.py)（含“高质量反馈 → recordActivity → mint SBT”的流程）
  - [reputation.ts](file:///Users/jason/Dev/crypto-projects/MyShop/reference/ethchiangmai-hackathon-2026/scripts/mint-service/reputation.ts)（viem + 私钥账户执行链上写入）
- NFT 前端/工具参考：`reference/ethchiangmai-hackathon-2026/nft`

此外，registry repo 中可复用的 MyShop 广场雏形（GToken Sale UI）来源：

- [GTokenSalePage.tsx](file:///Users/jason/Dev/mycelium/my-exploration/projects/registry/src/pages/v3-admin/GTokenSalePage.tsx)
- [useGTokenSale.ts](file:///Users/jason/Dev/mycelium/my-exploration/projects/registry/src/hooks/useGTokenSale.ts)
- 上述页面里涉及的地址/网络选择逻辑仅作为交互参考；MyShop 不依赖已废弃的 `@aastar/shared-config`

---

## 2. 总体架构（分层与边界）

### 2.1 分层

- L0：AAStar 现有基础设施（外部依赖）
  - Registry（社区注册、Role 管理、元数据）
  - GToken、GTokenStaking、Paymaster 等
  - `aastar-sdk`（对 registry/roles/tokens 的封装，以及后续 MyShop 的 client 扩展）
- L1：MyShop 链上协议（本 repo 的 contracts）
  - MyShopRegistry / MyShops：店铺注册与权限门控（必须是 COMMUNITY 才能注册）
  - MyShopItems：商品与购买入口，负责原子购买执行
  - Action Modules：购买后动作的可扩展模块（mint token、发 serial、触发 offchain 等）
  - Token Sales：aPNTsSale、GTokenSale（铸币权限在售卖合约内）
  - NFT Contracts：白标 NFT（参考黑客松实现，支持 SBT/可转移/混合）
- L2：MyShop Plaza 前端（本 repo 的 frontend）
  - 初期：前端直连合约（viem），实现购买、注册 shop、上架 item、购买 item
  - 稳定后：抽取 API + SDK 封装（减少前端复杂度、提升可观测性与风控）
- L3：服务与自动化（稳定后逐步引入）
  - Indexer/API：读取 Purchase/Shop/Item 事件，提供聚合查询
  - Serial/Notification 服务：外部 API 生成序列号、发 Telegram 通知、签名授权等
  - Bot 服务：可选与 MyShop 事件联动（目前参考代码是“反馈触发 mint”路径）

### 2.2 关键边界（避免耦合）

- AAStar Registry 负责“社区身份与角色”；MyShop 只做“消费与售卖协议”。
- MyShop 不直接持有长周期的私钥；任何需要私钥签名的 offchain 行为放在服务端（后续 API 层），并通过签名/nonce/过期时间来约束链上可验证动作。
- “NFT 销售 + 绑定动作执行”在链上只保证原子性边界内的部分；对于必须调用外部 API 的动作，采用“链上可验证的预签名凭证”来保持原子性，或采用异步最终一致的补偿机制（见第 5 章）。

---

## 3. 仓库与目录结构（以 MyShop 为主目录）

目标：先把结构立起来，允许“前端直连合约”跑通最小闭环；再演进到 API/SDK。

建议目录（规划，不写代码）：

- `/contracts`
  - `/src`
    - `MyShops.sol`：店铺注册、所有权、手续费与结算地址
    - `MyShopItems.sol`：商品、购买入口、原子执行
    - `/actions/*`：Action 模块（可插拔）
    - `/sales/*`：aPNTsSale、GTokenSale
    - `/nft/*`：白标 NFT（可引用/改造黑客松合约思路）
  - `/script`、`/test`：foundry 脚本与测试
- `/frontend`
  - `MyShopPlaza`：从 registry 的 GTokenSalePage 抽 UI/交互为广场模块
  - `ShopCreate`、`ItemCreate`、`ItemBuy`：最小闭环页面
  - 共享：网络/地址从 MyShop 的配置层读取，稳定后再并入 `aastar-sdk`
- `/reference/ethchiangmai-hackathon-2026`
  - 仅做参考来源，不作为正式模块；后续稳定再拆到 `/contracts` 与 `/services`

---

## 4. 链上合约体系设计（重点：权限、售卖、原子购买）

### 4.1 Role 与权限门控（社区才能开店）

关键点：MyShop 不自己发“社区身份”，而是读取 AAStar Registry 的角色。

- 判断“是否社区”：
  - MyShop 合约通过调用 Registry 的 `hasRole(ROLE_COMMUNITY, msg.sender)` 校验
  - `ROLE_COMMUNITY` 与 AAStar 一致：`keccak256("COMMUNITY")`
  - 这样 MyShop 的权限模型与 `aastar-sdk`、registry app 完全对齐

### 4.2 MyShops（店铺注册与基础治理）

核心职责：

- `registerShop(...)`：只有社区地址（Community Admin）可注册
- 店铺元信息：name、description、logoURI、policyURI、treasury（收款地址）
- 协议费率：成交费率默认 3%，可配置（后续可按商品分类细化；当前先简化）
- 防滥用费用：Item 上架费用（listing fee），默认 100 aPNTs，可配置；用于抑制 spam 上架
- 风控开关：店铺级 pause / item 级 disable

需要明确的“治理与可追溯性”：

- 任何变更（创建/更新/下架）必须 emit 事件，方便索引与审计
- shopOwner（社区地址）变更需双向确认或延时生效（防社工）

### 4.3 MyShopItems（商品、购买与原子执行）

关键职责：把“买 NFT”与“绑定动作执行”放进同一笔交易，确保原子性。

**商品模型（建议）**

- `shopId` 归属
- `price`（按支付币种的小数精度存储）
- `payToken`（ETH 用 address(0)，ERC20 用 token address）
- `nftContract` 与 `template`（或直接指定要 mint 的 NFT 合约）
- `action`（购买后动作模块地址）+ `actionData`（ABI 编码参数）
- 可选：库存与限购（maxSupply、perWallet、timeWindow）

**购买入口（建议）**

- `buy(itemId, quantity, recipient, extraData)`：统一入口
  - 收款（ETH 或 ERC20 transferFrom）
  - 扣除成交费率（默认 3%）并按配置分账（协议 treasury / 店铺 treasury）
  - mint NFT 到 recipient
  - 执行 action（例如 mint 50 aPNTs）
  - 全部成功才 emit `Purchased(...)`

**原子性保证**

- 任何一步失败整笔 revert
- action 失败不能吞错（否则会出现“只 mint 了 NFT 没到账 token”的破坏性体验）

### 4.4 NFT 白标合约（参考黑客松：SBT/可转移/混合）

黑客松合约的价值点：

- `CommunityNFT` 支持三种模式与 HYBRID 下 token 级 soulbound 标记：见 [CommunityNFT.sol](file:///Users/jason/Dev/crypto-projects/MyShop/reference/ethchiangmai-hackathon-2026/contracts/src/CommunityNFT.sol#L24-L139)
- 工厂合约要求 caller 必须是 community（registry hasRole gating）：见 [CommunityNFTFactory.sol](file:///Users/jason/Dev/crypto-projects/MyShop/reference/ethchiangmai-hackathon-2026/contracts/src/CommunityNFTFactory.sol#L42-L61)

对 MyShop 的建议改造点（概念层，不写代码）：

- NFT 的 `MINTER_ROLE` 不应长期给 bot 或个人 EOA
- 建议由 MyShopItems（或一个 ShopMinter 合约）持有 mint 权限，购买路径唯一化，便于审计与风控

### 4.5 Action Modules（购买后动作可插拔）

目标：把“买 NFT 后要做什么”抽象成通用接口，未来扩展：

- `MintAPNTsAction`：购买后铸 aPNTs 到 recipient
- `MintGTokenAction`：购买后铸 GToken 到 recipient（或调用 GTokenSale 进行发放）
- `SerialBindAction`：绑定序列号（见第 5 章）
- `NotifyAction`：触发 offchain 通知（见第 5 章）

Action 的安全边界：

- action 合约必须白名单（避免 shopOwner 注入恶意 action）
- action 只允许调用受控的 sale/mint 合约；禁止任意 external call
- 每个 action 都要有事件（包含关键字段与哈希），保证可追溯

---

## 5. 外部能力：序列号、外部 API、Telegram 通知（如何与“原子购买”兼容）

你希望“像电话卡揭开密码一样”，购买后得到序列号/串号，并能通知 Telegram。

这里要先明确一个事实：EVM 链上合约不能直接调用外部 HTTP API；因此必须在两种模式里选一种（可以都支持）：

### 5.1 模式 A：预签名凭证（强原子，已选）

目标：外部 API 生成序列号发生在链下，但链上购买仍保持强原子。

流程：

- 买家在前端点击购买前，先向 MyShop API 请求：
  - `serial`（或 bookingId、pinCode 等）
  - `sig`（由 MyShop 的签名服务对 `(itemId, buyer, serialHash, deadline, nonce)` 签名）
- `buy(...)` 时把 `serial`/`sig` 放进 `extraData`
- 链上验证签名通过才允许购买；并在事件里记录 `serialHash`（必要时也可记录明文 serial，但建议只记录 hash + 让用户在前端展示明文）

优点：

- NFT mint + token 到账 + serial 绑定都是同一笔交易，任何失败都 revert
- serial 生成可以对接任意外部系统（订房、库存、券码系统）

约束：

- 需要 MyShop API（以及签名密钥）作为稳定基础设施
- 必须设计 nonce 与过期时间，防重放与泄漏

### 5.2 模式 B：链上购买成功后异步履约（用于简化早期）

流程：

- 链上购买成功 emit `Purchased`
- Indexer/API 监听事件后调用外部系统生成 serial，并通过 Telegram 或站内消息发给用户
- 若外部系统失败，走补偿：重试/人工处理/退款策略

优点：

- 初期实现容易，不阻塞链上闭环

缺点：

- 不满足强原子；会出现“链上成功但序列号延迟/失败”的风险

### 5.3 Telegram 通知的建议

- 不把 Telegram bot 与链上 mint 权限绑定；bot 只做通知/交互
- 通知触发建议来源于 Indexer/API（监听 Purchase 事件），避免用户刷 bot 直接触发链上写入
- 黑客松 bot 的“触发 mint”逻辑可保留为参考样例：见 [bot.py 的 AUTO MINT](file:///Users/jason/Dev/crypto-projects/MyShop/reference/ethchiangmai-hackathon-2026/services/bot/bot.py#L582-L746)

---

## 6. aPNTs / GToken 售卖合约设计（铸币权限与风控）

### 6.1 共通原则

- Mint 权限只给售卖合约（或者给售卖合约 + 受控的管理合约），不把 mint 权限分散到个人或前端
- 所有售卖都必须可审计：
  - 每笔购买事件：payer、recipient、payToken、payAmount、mintAmount、rate、timestamp
  - 关键参数变更事件：价格、接受的 token、限额、暂停开关
- 必须提供风控机制（至少包含）：
  - pause/circuit-breaker
  - per-tx / per-day 限额
  - 接受 token 白名单
  - 价格源策略（固定价 / 预言机 / 管理员调价）与变更延时

### 6.2 GTokenSale（上限 21,000,000）

需求约束：GToken 总量固定上限；支付：ETH、WBTC/TBTC、aPNTs。

设计要点：

- 合约内部记录 `totalMinted`，铸币前强制检查 `totalMinted + mintAmount <= CAP`
- 支付 token：
  - ETH：直接收 `msg.value`
  - BTC：采用 WBTC/TBTC 等 ERC20 表示
  - aPNTs：ERC20 transferFrom
- 定价与兑换率：
  - 早期可固定 rate（便于开发与测试）
  - 稳定后引入预言机或 TWAP，并加“最大滑点”保护
- 资金去向：
  - 收到的资产进入 treasury（多签）
  - 可选分润到 shop/社区基金

### 6.3 APNTsSale（不限量但不可滥发）

需求约束：aPNTs 不限量，但必须“不可滥发”，且需要“明确记录 + 风险评估页面”。

风险来源：

- 供给无限 → 一旦售卖合约被攻击/滥用，会带来严重通胀与信任崩塌

建议控制（链上机制 + 展示页面支撑）：

- 链上控制：
  - 发行速率限制：按日/按区块的最大铸币额度（global + per-community）
  - 限购：每地址每日购买上限（避免机器人/洗量）
  - 价格保护：参考稳定币/ETH 的价格源，并加最大偏离阈值
  - 关键参数的 timelock（例如 24h 生效），给社区时间发现异常
  - 黑名单/冻结（只在明确治理前提下启用）
- 风险评估页面（前端/未来 API）必须展示：
  - 全量统计：aPNTs 发行总量、发行次数、发行明细（按天/按社区/按 item）
  - 社区画像：社区基础信息（来自 registry 元数据）+ 历史行为摘要
  - AI 风险系数：由外部接口返回（MyShop 风控服务），并展示计算版本/更新时间/返回原始摘要
  - 过去 24h/7d/30d 的铸币量、购买笔数、Top buyers
  - 当前发行速率上限、剩余额度、价格来源与更新时间
  - 合约状态（paused?）、最近一次参数变更、变更发起人

---

## 6.4 Item 上架数量限制（单店默认最多 5 个）

需求：单店可上架 item 的总数与社区 reputation 或 AI 风险系数相关；默认上限为 5。

为保证“链上可执行的限制”，建议采用“风控签名证明”：

- MyShop 风控服务（Risk Oracle）对 `(shopOwner, maxItems, riskScoreHash, deadline, nonce)` 出具签名
- `MyShopItems` 在 `addItem` 时验证签名，并强制 `currentItems < maxItems`
- 默认策略：未提供风控签名时，`maxItems = 5`

这样可以：

- 让“AI 风险系数”可用于链上硬限制（而不是仅展示）
- 防止 shopOwner 自行绕过上架上限

---

## 7. MyShop Plaza 前端（从 registry GToken Sale 页面升级）

### 7.1 复用与升级点

复用：

- 现有 GTokenSalePage 的 UI 结构可复用为 “广场”中的一个卡片/页面：见 [GTokenSalePage.tsx](file:///Users/jason/Dev/mycelium/my-exploration/projects/registry/src/pages/v3-admin/GTokenSalePage.tsx)

升级：

- 从“单一售卖页”升级为“广场”：
  - aPNTs 购买入口（支持 USDT/USDC/ETH/WBTC）
  - GToken 购买入口（支持 ETH/WBTC/aPNTs）
  - Shop 列表（仅展示已注册社区的 shop）
  - Item 列表与购买（购买时展示：将 mint 的 NFT + 将执行的动作）

### 7.2 前端与合约交互策略（先直连后抽 API）

- Phase 1：前端直连
  - AAStar 基础合约地址与网络参数：由 MyShop 的配置层提供（例如环境变量或链上读取），并由 `aastar-sdk` 的能力补齐（roleId/注册流程/交易封装）
  - MyShop 合约地址：初期通过 `.env`/配置注入；稳定后进入 `aastar-sdk` 的地址源
- Phase 2：引入 API
  - Shop/Item/购买记录从 API 获取（API 从链上事件聚合）
  - purchase prepare（序列号预签名）也从 API 获取（见 5.1）
- Phase 3：SDK 化
  - MyShop API 与合约交互封装为 `aastar-sdk` 的 `@aastar/myshop` 或类似 client
  - 稳定合约地址同步进 `aastar-sdk` 的地址源（不依赖 `@aastar/shared-config`）

---

## 8. 与 aastar-sdk 的整合设计（注册社区、购买、启动）

你要的“一步完成”与“分步完成”，建议在产品层提供两条路径，但底层都复用 SDK：

- 分步路径（更稳健）：
  1. 买 GToken（满足 registry 的 stake 要求）
  2. 用 SDK 调用 registry 注册 community（ROLE_COMMUNITY）
  3. 回到 MyShop 注册 shop、上架 item、开始售卖
- 一步路径（体验更好，但更复杂）：
  - 用前端或 API orchestrate：
    - 先完成购买/approve（可能包含多笔交易或 4337 批处理）
    - 再调用 registry 注册
    - 再调用 MyShop 注册 shop

稳定后建议把“编排能力”逐步从前端迁到 API/SDK：

- 前端只负责发起意图与展示状态
- API/SDK 负责：
  - 交易打包（可选 4337）
  - 失败重试与提示
  - 统一的地址/版本管理（shared-config）

---

## 9. 资产与 repo 整合清单（不写代码但要明确搬运与来源）

必须整合（参考源已在 MyShop/reference）：

- 黑客松合约与 NFT 思路：
  - `reference/ethchiangmai-hackathon-2026/contracts/src/*`
  - `reference/ethchiangmai-hackathon-2026/nft/*`
- Telegram bot 与自动 mint 思路：
  - `reference/ethchiangmai-hackathon-2026/services/bot/bot.py`
  - `reference/ethchiangmai-hackathon-2026/scripts/mint-service/reputation.ts`
- registry 的 GToken sale UI 思路：
  - `registry/src/pages/v3-admin/GTokenSalePage.tsx`
  - `registry/src/hooks/useGTokenSale.ts`

后续从 reference 抽到正式目录时的原则：

- 只抽“设计模式与接口”，不要把 hackathon 的私钥/环境变量逻辑原封不动带进生产模块
- 合约 mint 权限回收至 MyShopItems/受控模块，bot 只做通知与交互

---

## 10. 安全与密钥管理（必须长期成立）

- 仓库层面：
  - `.env`、`*.log` 必须被忽略，避免误提交（MyShop 已有 [​.gitignore](file:///Users/jason/Dev/crypto-projects/MyShop/.gitignore)）
- 运行层面：
  - 私钥只存在于本地开发机或部署环境的 secret manager
  - 任何日志不得打印完整私钥/Token（必须脱敏）
- 权限层面：
  - 生产环境的铸币权限只给售卖合约或 timelock + 多签
  - 任何“外部 API → 链上动作”的桥接必须使用签名 + nonce + 过期时间，且签名密钥不与资金权限共用

---

## 11. 里程碑与演进计划（从可跑到可规模化）

- 五步走对应关系：Step1=M0，Step2=M1，Step3=M2，Step4=M3，Step5=M4
- M0（Done）：参考代码与设计对齐
  - reference 已就位；明确 contracts/frontend 的结构与边界
- M1（Done）：最小闭环（前端直连合约）
  - shop 注册必须是 community
  - 示例 item：mint NFT + mint 固定 aPNTs（原子）
- M2（Mostly Done）：售卖合约上线（带风控）
  - aPNTsSale、GTokenSale 基本规则齐全（cap/limits/events/pausable）
  - 风险评估页：延后（优先级低于 M3 的 API/索引）
- M3（Done for demo）：API 提取与索引
  - 已完成：worker（监听 Purchased + payload enrich + 预签名 SerialPermit/RiskAllowance + 可选通知）
  - 已完成：Query API（/shops /items /purchases）+ 内存索引（ENABLE_INDEXER）
- M3.5（Done for demo）：前端接入 Worker + 角色入口
  - 已完成：广场（shops/items 列表）优先 Query API，失败回退链上读取
  - 已完成：买家入口支持串号签名（SerialPermit）与购买闭环
  - 已完成：店主后台（注册 shop / 配角色 / 上架与维护 item）
  - 已完成：协议后台（全局费率/签名人/action 白名单等配置入口）
- M4（Todo）：SDK 整合与地址稳定
  - 合约地址进入 `aastar-sdk` 的地址源（含链选择与环境隔离）
  - `aastar-sdk` 增加 MyShop client（对齐 registry 角色体系）
  - 前端从“直连合约”为主逐步演进到“SDK/API 优先”为主

---

## 12. 需要你确认/决定的关键点（用于你 review）

- BTC 支付定义：采用 WBTC/TBTC（链上）
- 序列号强原子：采用“预签名凭证”模式（5.1）
- aPNTs 的风控强度：发行速率限制与 timelock 是否必须从 Day 1 开始启用
- 协议费率与分润：Item 上架费用默认 100 aPNTs；成交费率默认 3%（后续可按品类细化）
