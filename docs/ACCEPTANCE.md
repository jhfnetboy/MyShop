# 验收指南（MyShop）

本指南面向新入职的产品经理，帮助你初始化、部署并按设计验证 MyShop 的功能，所有涉及文件均要求使用 IPFS 存储。阅读本指南与链接文档后，你应能独立完成环境搭建、功能验收与问题反馈。

## 一、前置条件

- 开发环境：Node.js 18+、pnpm 8+
- 以太坊网络：本地 Anvil 或测试网（推荐 Sepolia）
- IPFS：可用的网关或 Pin 服务（例如 web3.storage、Pinata）
- 钱包：用于店主操作与买家测试的钱包（建议使用两个账户）

## 二、代码与模块

- 前端（店主控制台与买家页面）：`frontend/`
- 后端 Worker（Permit、类别与监控）：`worker/`
- 合约（商品、店铺、动作）：`contracts/`
- 设计与方案说明：[Solution.md](./Solution.md)
- 变更记录：[CHANGELOG.md](./CHANGELOG.md)

## 三、配置与环境

- 前端配置（通过页面“配置”项或环境变量）
  - `VITE_RPC_URL`、`VITE_CHAIN_ID`
  - `VITE_ITEMS_ADDRESS`、`VITE_SHOPS_ADDRESS`
  - `VITE_ITEMS_ACTION_ADDRESS`（MintERC20Action）
  - `VITE_ERC721_ACTION_ADDRESS`（MintERC721Action）
  - `VITE_ERC721_DEFAULT_TEMPLATE_ID`（默认模板 ID）
  - `VITE_WORKER_URL`（Permit 服务 base）与 `VITE_WORKER_API_URL`（查询 API base）
  - `VITE_IPFS_GATEWAY`（自定义 IPFS 网关域名，统一转换 ipfs:// 链接）

- Worker 环境变量（`worker/src/index.js`）
  - `MODE=both`（同时启动监控与 Permit 服务）
  - `DEPLOYMENT` 或 `RPC_URL`、`CHAIN_ID`、`ITEMS_ADDRESS`
  - `SERIAL_SIGNER_PRIVATE_KEY`、`RISK_SIGNER_PRIVATE_KEY`（用于签发 Permit）
  - `PORT`（Permit 端口；默认 8787）
  - `ENABLE_API=1`、`API_PORT=8788`（启用查询 API）
  - `MYSHOP_CATEGORIES_JSON`（平台类别元数据，需包含 IPFS 文档链接）

## 四、IPFS 要求

- 若使用 IPFS：`tokenURI` 与 `ItemPage.uri` 使用 `ipfs://...`；并配置 `VITE_IPFS_GATEWAY`
- 若使用中心化：`tokenURI` 可为 `http(s)://...`；无需配置网关，原有流程保持正常
- 类别元数据中的 `*Ipfs` 字段为可选；提供时将在前端展示链接，未提供则不展示

## 五、启动与基本操作

1. 启动前端
   - `pnpm -C frontend dev`（Vite 开发）
   - 打开配置页，填入上述配置；点击“Save & Apply”

2. 启动 Worker
   - `node worker/src/index.js`（读取环境变量并启动服务）
   - 验证路由：
     - `GET /health`、`GET /config`、`GET /categories`、`GET /serial-permit-demo`

3. 运行 IPFS 网关与 Cluster（参考）
   - go-ipfs：使用 Docker 或裸机部署，开启 HTTP Gateway 与本地存储目录（例如 `/var/ipfs`）
   - 负载均衡：前置 Nginx/HAProxy；健康检查后转发到多个网关节点
   - IPFS Cluster：部署 cluster-service 与 cluster-ctl，设置副本数（≥2），把关键文档 CID 加入 Pin 列表
   - 前端配置：在“配置”页填写 `IPFS_GATEWAY` 自定义域名（例如 https://gw.community.org）

3. 店主后台（Add Item 面板）
   - 使用模板按钮或“类别下拉+应用类别”快速填充字段
   - MintERC20/MintERC721 生成器生成 `actionData`
   - 必要时设置默认 `templateId` 以加速 NFT+NFT（按模板）流程
   - 验证 IPFS 网关：点击“查看文档”，确保 IPFS 链接通过自定义网关正确打开
   - 若不使用 IPFS：直接填写 `http(s)://` 的 `tokenURI` 与页面链接，流程照常

## 六、功能验收流程

1. 模板与类别
   - 点击“加载类别”，从 Worker 拉取平台类别（含 IPFS 文档链接）
   - 选择类别并“应用类别”，确认字段被锁定（不可修改，shop 继承）
   - 点击“查看文档”，确认 Docs/README/Architecture/Template 四类链接均可通过配置的网关访问
   - 在多网关场景下，确认主/备网关均可达（切换 `IPFS_GATEWAY` 测试）

2. NFT+积分卡
   - 配置 `ITEMS_ACTION_ADDRESS` 指向 `MintERC20Action`
   - 通过生成器构造 `actionData`，上架商品并购买

3. NFT+NFT（按 URI）
   - 配置 `ERC721_ACTION_ADDRESS` 指向 `MintERC721Action`
   - 使用 `tokenURI` 生成 `actionData`，购买后验证二次铸造

4. NFT+NFT（按模板）
   - 设置默认 `templateId` 或手填
   - 使用按钮“一键生成 actionData”，购买后验证二次铸造

5. 实物/电子产品（串号 Permit）
   - 在 Worker 页面 `/serial-permit-demo` 生成 `extraData`
   - 前端 Buy 栏填入 `extraData` 后购买，验证串号签名与记录

## 角色引导路径总览（按角色）

- 协议运营方（治理者）
  - 页面：`#/protocol-console`
  - 路径：读取配置（G-01）→ 修改费率/金库/上架费（G-02/G-03/G-04）→ 动作白名单 allow/deny（G-05）
  - 期望：读写成功；deny 后购买 revert，allow 后购买成功；暂停后购买失败

- 店铺运营者（Shop Owner/Operator）
  - 页面：`#/shop-console`
  - 路径：注册 Shop（S-01）→ 授权 operator（S-04）→ 上架普通 Item（I-01）→ 上架需要串号的 Item（I-02）→ 下架 Item（I-04）
  - 期望：计数与页面可见性变化正确；串号商品无 permit 购买失败；下架后购买失败

- 买家（Buyer）
  - 页面：`#/buyer`
  - 路径：ERC20 购买（B-01）→ 串号购买（B-02）→ 过期（B-03）→ 重放（B-04）→ 参数不匹配（B-05）→ 店铺暂停（B-06）→ 动作被 deny（B-07）
  - 期望：成功/失败行为与日志符合预期；Worker 查询能看到 enrich 的记录

- 运维/社区节点（IPFS 网关与 Pin 服务，选配）
  - 文档：`docs/ipfs-gateway.md`、`docs/architecture.md`
  - 路径：部署 Kubo/Cluster/Nginx/Ingress → Pin 文档 CID → 前端配置 IPFS_GATEWAY → “测试网关”探测主/备 → 类别文档链接打开验证
  - 期望：主/备网关可达；CID 能打开；回退到 http(s) 时不影响原流程

## 八、故障定位与反馈

- 前端报错：查看页面底部 `txOut` 与 `buyFlowOut`，以及浏览器 Console/Network
- Worker 报错：查看启动终端输出与 `/metrics` 指标
- 合约错误：重点关注 `ActionNotAllowed`、`SerialRequired`、`InvalidPayment` 等错误码
- 反馈格式建议：问题概述、复现步骤、期望行为、实际日志（含请求与响应片段）、环境配置（脱敏）

## 九、参考链接（IPFS/代码）

- 合约与前端关键代码：
  - 前端配置与模板：[main.js](file:///Users/jason/Dev/crypto-projects/MyShop/frontend/src/main.js)
  - 前端环境读取：[config.js](file:///Users/jason/Dev/crypto-projects/MyShop/frontend/src/config.js)
  - Worker 启动与路由：[index.js](file:///Users/jason/Dev/crypto-projects/MyShop/worker/src/index.js)、[permitServer.js](file:///Users/jason/Dev/crypto-projects/MyShop/worker/src/permitServer.js)
  - 商品合约（Item/页面/购买）：[MyShopItems.sol](file:///Users/jason/Dev/crypto-projects/MyShop/contracts/src/MyShopItems.sol)
  - 动作合约（ERC721）：[MintERC721Action.sol](file:///Users/jason/Dev/crypto-projects/MyShop/contracts/src/actions/MintERC721Action.sol)

- 文档与方案：
  - 方案说明：[Solution.md](file:///Users/jason/Dev/crypto-projects/MyShop/docs/Solution.md)
  - 变更记录：[CHANGELOG.md](file:///Users/jason/Dev/crypto-projects/MyShop/docs/CHANGELOG.md)

> 注意：请将本验收文档与关联的 README/Architecture 文档上传至 IPFS，并在 `MYSHOP_CATEGORIES_JSON` 中配置对应的 `docsIpfs/readmeIpfs/architectureIpfs`，以供前端/运营人员统一访问。

## 十、测试用例与回归入口

- 完整用例与命令模板：[test_cases.md](file:///Users/jason/Dev/crypto-projects/MyShop/docs/test_cases.md)
- 一键本地回归（部署 + Worker + 购买 + 查询 + 前端 E2E）：
  - `pnpm -C worker regression`
  - 或 `./flow-test.sh`
- 仅前端构建与 E2E：`pnpm -C frontend regression`

## 十一、常见错误与排查速查表

- 前端页面
  - 症状：无法购买、按钮不可用、页面报错
  - 检查：`#/config` 是否完整；钱包是否连接；角色是否匹配（建议先在 `#/roles` 做 Access Check）
  - 购买失败常见错误码：`ActionNotAllowed`、`SerialRequired`、`InvalidPayment`、`Paused`
  - 浏览器 Console/Network：确认请求地址与链 ID；用“测试网关”按钮验证 IPFS 主/备可达性
  - 参考：前端配置与模板逻辑 [main.js](file:///Users/jason/Dev/crypto-projects/MyShop/frontend/src/main.js)、环境读取 [config.js](file:///Users/jason/Dev/crypto-projects/MyShop/frontend/src/config.js)

- Worker/API
  - 症状：/health 或 /config 不通、/serial-permit-demo 报错
  - 检查：环境变量是否正确（`MODE`、`RPC_URL`、`CHAIN_ID`、`ITEMS_ADDRESS`、`ENABLE_API`）；端口占用；私钥是否存在且权限安全
  - 命令：`curl -sS "$WORKER_URL/health"`、`curl -sS "$WORKER_API_URL/config"`
  - 类别文档：`MYSHOP_CATEGORIES_JSON` 是否包含 IPFS 链接（可选）；缺省时前端不展示链接
  - 参考：启动与路由 [index.js](file:///Users/jason/Dev/crypto-projects/MyShop/worker/src/index.js)、[permitServer.js](file:///Users/jason/Dev/crypto-projects/MyShop/worker/src/permitServer.js)

- 合约与链
  - 症状：交易 revert 或读不到配置
  - 检查：链 ID 与 RPC 是否一致；部署输出地址是否写入前端配置；角色/白名单是否正确
  - 命令：`cast call --rpc-url "$RPC_URL" "$SHOPS_ADDRESS" "owner()(address)"`、`shopCount()`、`itemCount()`
  - 购买错误常见原因：店铺暂停、Action 不在白名单、付款资产/数量错误、串号签名参数不匹配/过期/重放

- IPFS 网关/Pin
  - 症状：ipfs:// 链接无法打开、部分网关超时
  - 检查：`VITE_IPFS_GATEWAY` 是否配置；点击“测试网关”查看可达性；确认 CID 已 Pin（Cluster `status`）
  - CORS/TLS：反向代理需开启 80/443；Ingress/Nginx 超时需增大；证书有效期与域名匹配
  - 回退策略：不使用 IPFS 时改用 http(s)；流程照常运行
  - 参考：IPFS 独立文档与部署示例 [ipfs-gateway.md](file:///Users/jason/Dev/crypto-projects/MyShop/docs/ipfs-gateway.md)、架构模板 [architecture.md](file:///Users/jason/Dev/crypto-projects/MyShop/docs/architecture.md)

- ENS（可选，加分项）
  - 症状：域名打不开或未解析到内容
  - 检查：resolver 与 `contenthash` 是否设置；发布页面后是否更新到最新 CID；等待解析生效
  - 回退策略：未配置 ENS 时使用常规域名与路径
  - 参考：ENS 独立文档 [ens.md](file:///Users/jason/Dev/crypto-projects/MyShop/docs/ens.md)
