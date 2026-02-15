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

- Worker 环境变量（`worker/src/index.js`）
  - `MODE=both`（同时启动监控与 Permit 服务）
  - `DEPLOYMENT` 或 `RPC_URL`、`CHAIN_ID`、`ITEMS_ADDRESS`
  - `SERIAL_SIGNER_PRIVATE_KEY`、`RISK_SIGNER_PRIVATE_KEY`（用于签发 Permit）
  - `PORT`（Permit 端口；默认 8787）
  - `ENABLE_API=1`、`API_PORT=8788`（启用查询 API）
  - `MYSHOP_CATEGORIES_JSON`（平台类别元数据，需包含 IPFS 文档链接）

## 四、IPFS 要求

- 商品页面与素材的 `tokenURI`、`ItemPage.uri` 必须为 `ipfs://...`
- 类别元数据中的文档链接（`docsIpfs`、`readmeIpfs`、`architectureIpfs`、`templateIpfs`）必须为 `ipfs://...`
- 任何文件链接统一以 IPFS 访问（网关解析交由客户端完成）

## 五、启动与基本操作

1. 启动前端
   - `pnpm -C frontend dev`（Vite 开发）
   - 打开配置页，填入上述配置；点击“Save & Apply”

2. 启动 Worker
   - `node worker/src/index.js`（读取环境变量并启动服务）
   - 验证路由：
     - `GET /health`、`GET /config`、`GET /categories`、`GET /serial-permit-demo`

3. 店主后台（Add Item 面板）
   - 使用模板按钮或“类别下拉+应用类别”快速填充字段
   - MintERC20/MintERC721 生成器生成 `actionData`
   - 必要时设置默认 `templateId` 以加速 NFT+NFT（按模板）流程

## 六、功能验收流程

1. 模板与类别
   - 点击“加载类别”，从 Worker 拉取平台类别（含 IPFS 文档链接）
   - 选择类别并“应用类别”，确认字段被锁定（不可修改，shop 继承）

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

## 七、故障定位与反馈

- 前端报错：查看页面底部 `txOut` 与 `buyFlowOut`，以及浏览器 Console/Network
- Worker 报错：查看启动终端输出与 `/metrics` 指标
- 合约错误：重点关注 `ActionNotAllowed`、`SerialRequired`、`InvalidPayment` 等错误码
- 反馈格式建议：问题概述、复现步骤、期望行为、实际日志（含请求与响应片段）、环境配置（脱敏）

## 八、参考链接（IPFS/代码）

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
