# Shop 管理模块设计（角色拆分 / Item 维护 / 版本化页面 / 备份恢复）

## 1. 目标与约束

目标：

- Shop Owner 不再承担所有日常维护动作：通过“店铺内角色”授权给独立 EOA（运营/商品维护/动作配置），减少单点风险。
- Item 展示支持 NFT metadata + 图片 + 外链说明页面。
- 外链说明页面“绑定后不可撤销”，但支持新增版本并切换默认展示版本。
- 提供商家 Item 的一键备份与恢复（导入）。

约束：

- 与 shop 相关的角色数据全部由 MyShop 链上合约维护（本设计落在 [MyShops.sol](../contracts/src/MyShops.sol)）。
- 协议级安全边界不下放：比如 action 白名单仍由协议治理者控制（见 [MyShopItems.sol](../contracts/src/MyShopItems.sol) 的 `allowedActions`）。

---

## 2. 角色模型（链上：MyShops）

### 2.1 角色位图

MyShops 维护 `shopRoles[shopId][operator] => uint8` 位图：

- `ROLE_SHOP_ADMIN = 1`
- `ROLE_ITEM_MAINTAINER = 2`
- `ROLE_ITEM_EDITOR = 4`
- `ROLE_ITEM_ACTION_EDITOR = 8`

Shop Owner 默认拥有所有权限（无需显式授予）：`operator == shops[shopId].owner` 时视为拥有全部角色。

### 2.2 授权与治理

- 授权入口：`MyShops.setShopRoles(shopId, operator, roles)`
  - 只允许 shop owner 调用（避免“管理者再授权管理者”导致权限扩散不可控）。
- 查询入口：`MyShops.shopRoles(shopId, operator)` 或 `MyShops.hasShopRole(shopId, operator, roleBit)`

---

## 3. 权限矩阵（关键动作）

### 3.1 Shop 级动作（MyShops）

- `registerShop(...)`：仅 `Registry.hasRole(ROLE_COMMUNITY, msg.sender)`（社区才能开店）
- `updateShop(shopId, ...)`：shop owner 或 `ROLE_SHOP_ADMIN`
- `setShopPaused(shopId, paused)`：
  - 协议治理者 或（shop owner / `ROLE_SHOP_ADMIN`）
- `setShopRoles(shopId, operator, roles)`：仅 shop owner

### 3.2 Item 级动作（MyShopItems）

- `addItem(...)`：`ROLE_ITEM_EDITOR`
- `setItemActive(itemId, active)`：协议治理者 或 `ROLE_ITEM_MAINTAINER`
- `updateItem(itemId, ...)`：`ROLE_ITEM_EDITOR`
- `updateItemAction(itemId, action, actionData)`：`ROLE_ITEM_ACTION_EDITOR`

协议级动作（仍是协议治理者）：

- `setActionAllowed(action, allowed)`
- `setRiskSigner(...)`、`setSerialSigner(...)`

---

## 4. Item 说明页面（链上版本化绑定）

### 4.1 数据模型（MyShopItems）

对每个 item 维护“说明页面版本”：

- `itemPageCount[itemId]`：版本总数（从 1 开始递增）
- `itemPages[itemId][version] = { contentHash, uri }`
- `itemDefaultPageVersion[itemId]`：默认展示版本

### 4.2 行为约束（满足“不可撤销但可迭代”）

- 新增版本：`addItemPageVersion(itemId, uri, contentHash)`
  - 只增不删；历史版本永远可回溯（链上存证）。
  - 每次新增版本会自动把默认版本设为最新版本。
- 变更默认：`setItemDefaultPageVersion(itemId, version)`
  - 只能在 `1..itemPageCount` 范围内选择。

其中：

- `uri` 支持任意网页/内容地址（例如 `https://...` 或 `ipfs://...`）。
- `contentHash` 用于绑定“内容快照”的摘要（可选；例如对 markdown/html 的 hash）。

---

## 5. 备份与恢复（导入/导出）

### 5.1 导出（备份）

当前版本采用“前端直连链上读取”实现：

- 扫描 `itemCount`，逐个读取 `items(itemId)`，筛选 `shopId` 匹配项。
- 对每个 item 读取：
  - `itemPageCount` + `getItemPage(itemId, v)`
  - `itemDefaultPageVersion`
- 输出 JSON 并下载到本地。

重要说明：

- 该实现适用于 demo/人工测试与小规模数据。
- 规模化后建议由 worker 的 Query API / indexer 提供导出接口，避免前端全量扫描。

### 5.2 导入（恢复）

当前版本采用“前端直连链上写入”实现：

- 对导入 JSON 中的每个 item：
  - 调用 `addItem(...)` 重新创建 item
  - 逐条调用 `addItemPageVersion(...)` 重放页面版本
  - 调用 `setItemDefaultPageVersion(...)` 设定默认版本

重要说明：

- 导入会产生新的 itemId（链上自增），不会与旧 itemId 保持一致。
- 若要做“旧 itemId → 新 itemId”的映射，可在导入完成后由前端生成一份映射表（未来可加入）。

---

## 6. 前端展示与管理面板

当前 demo 前端在 [main.js](../frontend/src/main.js) 增加了：

- Shop Roles：设置 operator 的角色位图（便于“一个 EOA 管理日常维护”）
- Update Item（basic）：更新价格、支付币、NFT 合约、tokenURI、是否需要串号
- Update Item Action：更新 action + actionData
- Item Page（versioned）：新增页面版本 / 设置默认版本
- Backup / Restore Items：导出/导入 JSON
- Read Item：读取 item 后尝试拉取 `tokenURI` 的 metadata，并展示图片与外链；同时展示默认页面版本链接

---

## 7. 后续可演进点（不影响当前实现）

- 将导出/导入迁移到 worker 的 API（支持分页、增量、校验与签名授权）。
- 允许 shop owner 旋转 owner（或多签 owner），并保留 operator 角色不变，降低迁移成本。
- 为 item 页面版本增加事件索引字段（例如 `indexed contentHash`）以便更高效检索。
