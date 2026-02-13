# 里程碑与任务（从 Demo 到 可上线）

本文把“从 demo 到产品化”之间的差距，拆成可跟踪的里程碑 + 任务清单 + 验收标准。该文档用于持续维护与 weekly follow。

## 0. 当前状态（对齐 Solution.md）

- 当前已完成到：M3.5（Done for demo）—— 合约部署 → Worker(permit/api/watch) → 前端(广场/买家/店主后台/协议后台) 能衔接跑通。
- 下一步目标：把系统变成“可反复验证、可回归、可上线”。

参考：[Solution.md](file:///Users/jason/Dev/crypto-projects/MyShop/Solution.md#L402-L425)

## 1. Milestone A：测试与回归基建（让“能跑”变成“可反复验证”）

**验收标准**

- 有一份可执行测试清单，覆盖核心角色与关键失败场景
- 一键 demo 启动后，一键跑完关键用例（至少：开店/上架/串号购买/查询/失败场景）
- 能在 CI（或本地统一命令）中重复运行，输出稳定

**任务**

- A1：维护全角色 E2E 用例文档，并持续更新（入口、命令模板、期望）
  - 状态：已完成（见 docs/test_cases.md）
- A2：把关键用例脚本化（demo_local + buy + query 验证），形成回归入口
  - 状态：已完成（见 scripts/regression_local.sh / flow-test.sh）
- A3：补齐失败用例的自动化验证（nonce 重放、deadline 过期、权限不足、暂停/下架）
  - 状态：已完成（见 scripts/regression_local.sh）
- A4：把回归命令写进顶层脚本与文档，形成统一的“测试脚本清单”
  - 状态：已完成（入口已在 docs/test_cases.md / README.md 固化）

## 2. Milestone B：Worker 产品化（让“轻服务”可运行、可恢复、可观测）

**验收标准**

- purchases/shop/item 的关键数据不再只依赖内存：重启不丢（至少 purchases 不丢）
- indexer 可观测：能看到 lastIndexedBlock、延迟、错误计数、重连次数
- Permit API 具备基本安全与一致性：错误码规范、参数校验、签名域一致性校验、基础限流

**任务**

- B1：实现 purchases 持久化（本地 sqlite/kv 任选其一），并支持重启恢复
  - 状态：已完成（默认启用 JSON KV：data/indexer.<chainId>.<items>.json；重启可恢复）
- B2：实现 indexer 的重放/去重策略规范化（lookback、key 规则、最大缓存上限）
  - 状态：已完成（replayLookbackBlocks 回放 + txHash:logIndex 去重 + reorgLookbackBlocks 回滚 + dedupeWindowBlocks 窗口裁剪）
- B3：增加 /metrics 或扩展 /indexer 输出（错误计数、最近一次错误、重连状态）
  - 状态：已完成（/indexer + /metrics 已输出 lagBlocks / lastError / consecutiveErrors / reconnectCount 等）
- B4：Permit API 限流与滥用防护（最小可行：按 IP/路径的滑动窗口）
  - 状态：已完成（默认开启；429 返回 errorCode=rate_limited + Retry-After；可通过 env 调整阈值）
- B5：签名密钥治理文档（托管/轮换/隔离资金权限/审计流程）
  - 状态：已完成（见 docs/worker.md「签名密钥治理（B5）」）

## 3. Milestone C：前端流程打磨（让“入口齐全”变成“体验可用”）

**验收标准**

- 角色入口信息架构定稿（协议治理/店主/店铺角色/买家），默认页面明确
- 关键错误都有“可操作提示”（网络/地址/权限/签名过期/nonce 已用/余额不足）
- 广场/详情/购买凭证展示完善：字段定义清晰，空态/成功态/失败态完整
- 与 A/B 的回归清单对齐：test_cases.md 的关键场景在 UI 下可验证（并有最小自动化）

**任务**

- C1：定义并固化“页面 IA + 角色权限矩阵”，在 UI 上做硬性 gating
  - 状态：已完成（协议后台仅对 protocol owner 可见/可进；店主后台对无权限钱包硬性拦截；Roles 页输出 pageAccess）
- C2：错误与状态模型统一（前端把链上/Worker 错误映射成用户提示）
  - 状态：已完成（统一 formatError/showTxError；429/网络/配置/权限/签名过期等都有 Fix 提示）
- C3：广场与详情字段对齐（价格、库存/限购、时间窗、requiresSerial、action 类型）
  - 状态：已完成（广场/店铺详情 item 列表与详情字段对齐，增加 nft/tokenURI 摘要）
- C4：购买凭证与历史页（purchases 列表、筛选、交易链接、tokenId/serialHash 展示）
  - 状态：已完成（purchases 列表可展开 Proof，并支持复制；保留 tx/link/tokenId/serialHash）
- C5：交易生命周期体验完善（approve/buy 进度、pending、重试、失败引导）
- C6：内置诊断与降级路径（RPC/链不匹配、Worker 不可用、429 限流提示、数据来源标识）
  - 状态：已完成（诊断页可 check rpc/worker；广场展示 shops/items 数据来源统计；429 提示包含等待秒数）
- C7：补齐全角色最小 E2E 自动化（基于 test_cases.md 的核心 happy+fail 集）

**建议推进顺序（先定规则，再统一语义，再打磨路径，最后自动化固化）**

- ① C1：先固化入口与权限边界（避免页面反复返工）
- ② C2：统一错误/状态模型（让所有页面的提示与交互一致）
- ③ C6：补齐诊断与降级路径（把“报错”变成“可自救”）
- ④ C5：完善交易生命周期体验（approve/buy/pending/success/fail 的可理解与可重试）
- ⑤ C3：对齐广场与详情展示字段（信息完整、空态完整）
- ⑥ C4：完善购买凭证与历史页（售后/复购入口）
- ⑦ C7：把 test_cases.md 的关键场景落成最小 E2E（防止体验回退）

## 4. Milestone D：工程化与发布（让“本地跑通”变成“可部署/可升级”）

**验收标准**

- dev/test/staging/prod 环境配置有明确结构与版本管理（链选择、地址版本、发布说明）
- CI 能跑：合约 build/test、worker check/test、前端 build/check（至少）
- SDK/地址稳定进入 M4：前端逐步 SDK/API 优先

**任务**

- D1：定义环境与地址版本结构（以 aastar-sdk 地址源为目标）
- D2：落地 CI（lint/typecheck/test/e2e 的最小集）
- D3：SDK 整合（MyShop client + 角色体系对齐 + 地址源）
- D4：发布流程文档（版本号、变更日志、回滚策略）

### D4：发布流程（Release Playbook）

目标：让每次“发布/上线/回滚”都有一致的步骤、可追踪的版本号、可复现的构建与验证。

#### 版本号（Versioning）

- 采用 SemVer：`vMAJOR.MINOR.PATCH`
- 建议约定：
  - `MAJOR`：合约接口/签名域/业务流程有破坏性变更（老前端/worker 不兼容）
  - `MINOR`：新增功能/字段（兼容旧流程）
  - `PATCH`：修 bug / 改体验 / 不影响接口兼容
- 预发布（可选）：`vX.Y.Z-rc.N` 用于 staging 验证；通过后打正式 tag `vX.Y.Z`

#### 变更日志（Changelog）

- 每次发布都需要一份“可读的变更说明”，建议写在 GitHub Release Notes（或 PR 描述汇总）
- 最小模板：
  - **Contracts**：新增/变更的函数、事件、权限、签名域、部署地址版本
  - **Worker**：permit/api/watch 的行为变化、限流/错误码/指标变化
  - **Frontend**：新增入口、字段展示变化、错误提示变化
  - **Ops**：环境变量新增/默认值变化、回归命令变化

#### 发布前检查（Preflight）

1. 确认地址/环境选择策略

- 前端：用 `VITE_DEPLOYMENT`（或各项 `VITE_*`）确定 rpc/chainId/合约地址/worker url
- Worker：用 `DEPLOYMENT`（或各项 `RPC_URL/CHAIN_ID/...`）确定链与地址
- 原则：发布时优先用 “deployment + version” 来锁定地址版本，而不是靠人工复制粘贴

2. 运行本地回归（与 CI 对齐）

```bash
./build-test-contracts.sh
pnpm -C worker regression:worker
pnpm -C frontend regression
./scripts/regression_local.sh
```

#### 发布步骤（Release）

1. 合约（Contracts）

- 如果需要新部署：产出并固化“地址版本”（例如：`anvil@v1`、`sepolia@v1`）
- 将新地址写入对应的地址源（目前在前端 `deployments.js` 做默认值；也可以完全由 env 覆盖）

2. Worker

- 按目标环境配置 env（RPC/CHAIN_ID/ITEMS_ADDRESS/SHOPS_ADDRESS 等）
- 通过 smoke / regression 验证后部署到目标运行环境

3. Frontend

- 通过 `pnpm -C frontend build` 产出静态资源
- 按环境设置 `VITE_DEPLOYMENT` 或 `VITE_*`，确保默认配置与目标地址版本一致

4. 打 tag + 发布说明

```bash
git tag -a vX.Y.Z -m "MyShop vX.Y.Z"
git push origin vX.Y.Z
```

#### 回滚策略（Rollback）

- **前端/Worker 回滚**：回滚到上一个稳定 tag 对应的构建产物与环境变量（尤其是 `*_DEPLOYMENT` / 地址）
- **合约回滚**：
  - 已部署的新合约地址不可“撤销”，回滚的本质是“切回旧地址版本”（前端/worker 配置回指旧地址）
  - 重要原则：旧地址版本必须长期可用，除非明确废弃并在变更说明中标记
- 回滚执行建议：
  - 先回滚前端（最小影响、最快）
  - 再回滚 worker（避免 permit 行为不一致）
  - 合约仅在必要时切换默认地址版本（并在 release notes 说明）

## 5. 本周建议推进顺序（最小风险）

- 先做 A（回归与用例可执行）→ 再做 B（Worker 持久化/可观测）→ 再做 C（体验）→ 并行 D（CI/配置/SDK）
