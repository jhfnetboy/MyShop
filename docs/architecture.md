# 架构与模块说明

## 目标

MyShop 把“链下风控/串号/通知”等能力拆成可替换的模块，同时把“收款、分润、发 NFT、执行动作(Action)”收敛为链上一次原子交易完成。

## 模块边界

### On-chain（合约）

- **Registry**：社区准入来源（`ROLE_COMMUNITY`）。
- **MyShops**：Shop 注册与协议级配置（上架费、协议费率、协议金库）。
- **MyShopItems**：商品上架与购买原子执行中心；包含风控签名与串号签名校验；包含 Action 白名单。
- **CommunityNFT**：实际发券（SBT/Transferable/Hybrid 由 NFT 合约自己实现；MyShop 只调用 mint）。
- **Action 合约**：购买时执行的可组合能力（例如送积分、发事件等）。

### Off-chain（服务/应用）

- **风控签名服务（RiskAllowance）**：用于在链上默认限制之外，按风控策略放宽某 shop 的 item 上限。
- **串号签名服务（SerialPermit）**：用于“先产生串号/订单，再允许购买”的 Mode A 流程。
- **MyShop Worker**：监听购买事件 → 通知（Webhook/Telegram）；也可承载签名 API（Permit Server）。

## 数据流与控制流

### addItem（上架）

1. Shop owner 准备 `AddItemParams`。
2. 若要突破默认 item 上限：链下风控签名服务签 `RiskAllowance`。
3. 上架时合约收取上架费（ERC20），转入协议金库。

### buy（购买）

1. Buyer 先准备 `extraData`：
   - requiresSerial=true 时：需要链下串号服务签 `SerialPermit`，并把 `(serialHash,deadline,nonce,signature)` ABI 编码进 `extraData`。
2. 合约校验 permit + nonce 未使用。
3. 合约按 `platformFeeBps` 拆分协议费与店铺收入并转账。
4. 合约 mint NFT；再调用 action 合约 `execute(...)` 完成可组合逻辑。

## Event 作为 Shop Item（活动门票 / 报名凭证）

把“活动发布 / 参与报名 / 发入场凭证”视为一类标准商品，直接映射为：

- **一个活动（Event）= 一个 Shop**
  - 由活动所属社区/主办方注册 shop，并把 shop 的 metadataHash / off-chain 页面作为活动主页索引。
- **一个票种/报名档位 = 一个 Item**
  - item 的 `unitPrice + payToken` 表达“用什么资产购买/报名”。
  - item 的 `tokenURI` 表达“活动票/报名凭证的元数据入口”（可指向活动页、票种页、IPFS 元数据等）。
  - item 的 “说明页版本化” 可把活动页当作可迭代、可追溯的展示页面（见 shop_management.md 的 Item Page 章节）。

这样，购买即完成：

- 费用拆分与结算（协议费/店铺收入）
- 发放门票 NFT（SBT/普通 NFT/混合模式由 NFT 合约实现）
- 执行扩展动作（例如发积分、发事件、触发链下派发）

## 社区自部署 NFT 合约接入（每个社区一个或多个 NFT 合约）

当前 MyShopItems 对 NFT 合约的集成方式是“面向最小 mint 接口”：

- 每个 item 通过 `nftContract` 指向任意 NFT 合约地址（可以是社区自己部署的合约）。
- MyShop 在购买时只调用 `mint(to, uri, soulbound) -> tokenId`，不假设它是 ERC721/1155 的哪一种实现。

因此：

- **支持 shop item 发 NFT**：上架时配置 `nftContract/tokenURI/soulbound`。
- **支持 event NFT**：event 本质是 item；event 页面用 `tokenURI` 与 item page 机制表达；buy() 时 mint 即发票。
- **SBT / 纯 NFT / 混合模式**：
  - `soulbound` 标记会被传给 NFT 合约，是否“真的不可转让”由 NFT 合约自身 enforce。
  - “混合模式”可理解为：mint NFT 的同时再执行 action（例如送 ERC20、发事件、触发链下凭证发放）。

## 购买资格/Attestation 扩展（可插拔验证，可多重组合）

IFT 是 NFT 的 typo；若把“是否允许购买某活动票/报名”看作 Eligibility（资格校验），推荐把它设计成可插拔模块，并支持多重校验组合，例如：

- 必须是 endorser（或持有某角色）
- 必须社区 reputation ≥ 阈值
- 必须 global reputation ≥ 阈值
- 必须通过某外部 attestation 合约的验证函数

建议落两种可并行的扩展路径：

### 路径 A：On-chain 外部验证器（强一致，配置灵活）

- 定义一个标准接口（示意）：
  - `validate(buyer, recipient, itemId, shopId, quantity, extraData) -> (bool)` 或直接 `revert` 表示失败
- 在 MyShopItems 中为 shop 或 item 维护 `validators[]`（可多个），buy() 时逐个调用验证器。

特点：

- 优点：资格判断 100% 链上可复现，可插拔/可组合/可审计。
- 缺点：每次购买会有额外外部调用，gas 成本更高；验证器设计需谨慎避免重入/状态污染。

### 路径 B：Off-chain 聚合证明（省 gas，适合复杂策略）

- 由“资格服务/策略引擎”对多规则（endorse、reputation、外部 attestation）做聚合判断后，签一个 EIP-712 的 `EligibilityPermit`。
- buy() 时只验证该签名（类似现有的 SerialPermit/RiskAllowance 模式）。

特点：

- 优点：链上只做签名验证，gas 稳定；复杂策略可以快速迭代。
- 缺点：信任边界在签名者；需要治理/审计签名者的权限与策略。

## 推荐的演进路线

- **短期**：先用 Worker 提供 Permit API + 通知能力，快速把“购买后通知/落库/发串号”闭环跑通。
- **中期**：把 Risk/Serial 的签名端拆成独立服务，Worker 只负责监听与转发。
- **长期**：把 Action 的类型扩展为更多标准模块（积分、白名单门票、订阅、权益领取等）。
- **扩展**：引入 Eligibility（资格）模块，支持 Event 门票的多重门槛与可配置策略。
