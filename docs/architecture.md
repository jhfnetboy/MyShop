# 架构与模块说明

## 目标

MyShop 把“链下风控/串号/通知”等能力拆成可替换的模块，同时把“收款、分润、发 NFT、执行动作(Action)”收敛为链上一次原子交易完成。

## 模块边界

### On-chain（合约）

- **Registry**：社区准入来源（`ROLE_COMMUNITY`）。
- **MyShops**：Shop 注册与平台级配置（上架费、平台费率、平台金库）。
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
3. 上架时合约收取上架费（ERC20），转入平台金库。

### buy（购买）

1. Buyer 先准备 `extraData`：
   - requiresSerial=true 时：需要链下串号服务签 `SerialPermit`，并把 `(serialHash,deadline,nonce,signature)` ABI 编码进 `extraData`。
2. 合约校验 permit + nonce 未使用。
3. 合约按 `platformFeeBps` 拆分平台费与店铺收入并转账。
4. 合约 mint NFT；再调用 action 合约 `execute(...)` 完成可组合逻辑。

## 推荐的演进路线

- **短期**：先用 Worker 提供 Permit API + 通知能力，快速把“购买后通知/落库/发串号”闭环跑通。
- **中期**：把 Risk/Serial 的签名端拆成独立服务，Worker 只负责监听与转发。
- **长期**：把 Action 的类型扩展为更多标准模块（积分、白名单门票、订阅、权益领取等）。

