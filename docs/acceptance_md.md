# Milestone 新手验收文档（面向产品经理）

本文用于里程碑的可执行验收，目标读者为不熟悉代码的产品经理或验收人员。按步骤执行即可完成“部署、验证、回归、体验”的验收闭环。

## 1. 验收范围（mD 对齐）

- 工程化与发布可执行：环境配置、回归入口、发布/回滚步骤清晰
- 合约/Worker/前端最小 CI 命令可稳定运行
- 关键流程可在本地或测试环境复现（含成功 + 失败场景）

对应里程碑定义见 [milestones.md](./milestones.md#L88-L176)

## 2. 前置准备

### 2.1 安装依赖工具

```bash
anvil --version
forge --version
cast --version
curl --version
pnpm -v
node -v
```

### 2.2 获取源码并安装依赖

```bash
pnpm -C worker install
pnpm -C frontend install
```

## 3. 一键回归（推荐）

这一步会自动完成：本地链启动 → 合约部署 → Worker 启动 → 串号购买成功/失败用例 → 查询验证 → 前端 E2E。

```bash
RUN_E2E=1 bash ./scripts/regression_local.sh
```

**通过标准**

- 终端最后输出 `ok: regression passed`
- 输出 `demo/demo.json` 与 `demo/worker.log` 路径

**失败处理**

- 若提示端口占用：重新执行（脚本会自动寻找空闲端口）
- 若提示依赖缺失：按上文安装对应工具

## 4. 分模块回归（与 CI 对齐）

### 4.1 合约

```bash
bash ./build-test-contracts.sh
```

**通过标准**

- 所有 `forge test` 通过

### 4.2 Worker

```bash
pnpm -C worker regression:worker
```

**通过标准**

- `smoke ok` 输出出现

### 4.3 前端

```bash
pnpm -C frontend typecheck
pnpm -C frontend regression
```

**通过标准**

- `vite build` 成功
- `playwright test` 完成，失败为 0
- `pnpm typecheck` 输出无错误

## 5. 手动验收（产品视角）

### 5.1 打开前端

默认本地地址：`http://127.0.0.1:5173/`

页面入口：

- 广场：`#/plaza`
- aPNTs 购买页：`#/sale-apnts`
- GToken 购买页：`#/sale-gtoken`
- 风控评估：`#/risk`
- 买家：`#/buyer`
- 店主后台：`#/shop-console`
- 协议后台：`#/protocol-console`
- 配置：`#/config`

### 5.2 配置检查

在 `#/config` 页面点击 **Load from Worker /config**，再点击 **Save & Apply**。

**通过标准**

- 读取到 chainId / itemsAddress / shopsAddress
- 页面顶部 service 状态显示 `permit=ok` 与 `api=ok`

### 5.3 买家购买闭环

进入 `#/buyer`：

1. 点击 **Connect Wallet**
2. 点击 **Read Item**，确认 item 信息输出
3. 点击 **Approve**
4. 点击 **Fetch extraData**
5. 点击 **Buy**

**通过标准**

- Buy Status 显示 approve/buy 的 hash 与状态
- 最终跳转到 `#/purchases`，能看到新购买记录

### 5.4 失败场景提示

在 `#/buyer` 页面：

- 将 serialDeadline 改成过去时间再购买
- 期望出现可操作提示（SignatureExpired/InvalidSignature/NonceUsed 等）

**通过标准**

- 错误提示包含明确的修复建议（例如重新获取 extraData）

### 5.5 购买入口与风控展示

进入 `#/sale-apnts` 与 `#/sale-gtoken`：

1. 检查页面卡片是否包含支付方式、发行策略与购买步骤
2. 若配置了外部入口（见第 6 节），点击按钮可跳转外部购买页

进入 `#/risk`：

1. 修改“已发行占比”和“流动速度”滑条
2. 观察风险等级（绿色/黄色/红色）随阈值变化

**通过标准**

- sale 页面可展示清晰购买说明与入口按钮
- 风控页面风险等级随占比变化正确切换（50% 黄、80% 红）

### 5.6 广场社区过滤与动作/NFT 明细

进入 `#/plaza`：

1. 在 **community owner(optional)** 填入社区 owner 地址
2. 点击 **Reload**（或任何刷新入口）
3. 确认 Shop 与 Item 列表都只显示该 owner 对应数据

进入 `#/item/:itemId`：

1. 查看 item 基本字段与 actionData/actionDataBytes 输出
2. 确认 tokenURI、action、nftContract 的展示正确

进入 `#/purchases` 或 item detail 页的 **Recent Purchases**：

1. 查看每条购买记录的 action/nft/tokenURI 摘要
2. 展开 Proof 仍可复制购买凭证

**通过标准**

- plaza 按 community owner 过滤有效且不会混入其他 shop/item
- item 详情包含 actionData/actionDataBytes 与 tokenURI 摘要
- purchases 列表展示 action/nft/tokenURI 摘要且 Proof 正常

## 6. 关键参数说明（验收时可复用）

若不使用一键脚本，可手动设置：

```bash
export RPC_URL="http://127.0.0.1:8545"
export CHAIN_ID="31337"
export ITEMS_ADDRESS="0x5FC8d32690cc91D4c39d9d3abcBD16989F875707"
export SHOPS_ADDRESS="0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9"
export WORKER_URL="http://127.0.0.1:8787"
export WORKER_API_URL="http://127.0.0.1:8788"
```

前端也可通过环境变量设置默认值：

```bash
VITE_RPC_URL=
VITE_CHAIN_ID=
VITE_ITEMS_ADDRESS=
VITE_SHOPS_ADDRESS=
VITE_WORKER_URL=
VITE_WORKER_API_URL=
VITE_APNTS_SALE_URL=
VITE_GTOKEN_SALE_URL=
```

参考 [frontend/.env.example](../frontend/.env.example)

## 7. mD 验收清单（勾选）

- D1 环境与地址版本结构清晰（deployment + version 的方式可用）
- D2 CI 最小命令可运行（合约 build/test、worker check/test、前端 build/check/typecheck/e2e）
- D3 SDK/地址源可用（前端通过部署配置或 env 读取地址）
- D4 发布流程清晰（版本号、发布步骤、回滚策略）

对应发布流程说明见 [milestones.md](./milestones.md#L103-L182)

## 8. 常见问题

- **Worker/permit 不可用**：检查 `WORKER_URL` 与 `WORKER_API_URL` 是否正确，或重新运行 `scripts/regression_local.sh`
- **签名失败**：确认买家地址、itemId、serial、deadline 与 extraData 对应一致，必要时重新 Fetch extraData
- **链不匹配**：检查 chainId 与钱包网络是否一致
