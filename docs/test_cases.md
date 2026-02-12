# 可执行测试用例清单（E2E）

本文把“全角色测试用例表”落成可执行的脚本/操作清单：每条用例都给出对应的前端页面入口与命令模板（curl/cast），用于回归与验收。

## 0. 前置：统一环境变量（建议复制到终端）

本地一键回归（自动跑：部署 + Worker + 成功购买 + 失败场景 + 查询验证）：

```bash
./scripts/regression_local.sh
```

```bash
export RPC_URL="http://127.0.0.1:8545"
export CHAIN_ID="31337"

export ITEMS_ADDRESS="0x5FC8d32690cc91D4c39d9d3abcBD16989F875707"
export SHOPS_ADDRESS="0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9"

export WORKER_URL="http://127.0.0.1:8787"
export WORKER_API_URL="http://127.0.0.1:8788"

export BUYER="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
export BUYER_PK="0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
export DEPLOYER="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
export DEPLOYER_PK="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
```

依赖工具：

```bash
anvil --version
forge --version
cast --version
curl --version
pnpm -v
node -v
```

## 1. 页面入口（用于手动验证）

前端地址：`http://127.0.0.1:5173/`

- 广场：`#/plaza`
- 买家：`#/buyer`
- 店主后台：`#/shop-console`
- 协议后台：`#/protocol-console`
- 配置：`#/config`

## 2. Worker / API 冒烟

### W-01 Worker 健康检查

- 页面入口：无（命令行）

```bash
curl -sS "$WORKER_URL/health"
curl -sS "$WORKER_API_URL/health"
curl -sS "$WORKER_API_URL/config"
curl -sS "$WORKER_API_URL/indexer"
```

期望：

- health 返回 `{"ok":true}`
- config 返回 chainId/itemsAddress/shopsAddress

## 3. 协议治理（Protocol Console）

### G-01 读取协议配置

- 页面入口：`#/protocol-console`
- 命令模板（链上读取）：

```bash
cast call --rpc-url "$RPC_URL" "$SHOPS_ADDRESS" "owner()(address)"
cast call --rpc-url "$RPC_URL" "$SHOPS_ADDRESS" "platformFeeBps()(uint16)"
cast call --rpc-url "$RPC_URL" "$SHOPS_ADDRESS" "platformTreasury()(address)"
```

期望：返回 owner、费率、treasury 地址。

### G-02/G-03/G-04 修改全局费率/金库/上架费

- 页面入口：`#/protocol-console`
- 命令模板（示意，函数名以合约为准；建议优先通过页面触发）：

```bash
# 仅用于调试：通过 cast send 发起治理交易（如果你知道确切函数签名）
# cast send --rpc-url "$RPC_URL" --private-key "$DEPLOYER_PK" "$SHOPS_ADDRESS" "<fnSig>" <args...>
```

期望：交易成功；随后再次 readContract/cast call 能读到新配置；购买分润/上架扣费随之变化。

### G-05 Action 白名单 allow/deny

- 页面入口：`#/protocol-console`
- 命令模板：通过页面设置 allowedActions，再用 B-02/B-03 购买验证 allow/deny 行为差异。

期望：deny 后购买 revert；allow 后购买成功。

## 4. 店主后台（Shop Console）

### S-01 注册 Shop

- 页面入口：`#/shop-console`
- 期望：shopCount +1；能在广场 `#/plaza` 看到新 shop。
- 命令模板（验证 shopCount）：

```bash
cast call --rpc-url "$RPC_URL" "$SHOPS_ADDRESS" "shopCount()(uint256)"
```

### S-04 配置店铺角色（operator 授权）

- 页面入口：`#/shop-console`
- 期望：被授权地址能执行对应动作（上架、维护、配置 action 等）。

### S-05 暂停店铺

- 页面入口：`#/shop-console`（或 `#/protocol-console` 以治理者身份）
- 期望：暂停后购买失败（见 B-06）。

## 5. 上架与维护（Item）

### I-01 上架普通 Item（不需要串号）

- 页面入口：`#/shop-console`
- 期望：itemCount +1；广场能看到；买家能购买。
- 命令模板（验证 itemCount）：

```bash
cast call --rpc-url "$RPC_URL" "$ITEMS_ADDRESS" "itemCount()(uint256)"
```

### I-02 上架需要串号的 Item（requiresSerial=true）

- 页面入口：`#/shop-console`
- 期望：买家购买时必须提供 SerialPermit，否则 revert（见 B-02/B-05）。

### I-04 下架 Item（active=false）

- 页面入口：`#/shop-console`（若为维护角色）或 `#/protocol-console`（若为治理者）
- 期望：buy revert（见 B-07 的类似验证方法）。

### I-06 超过默认上架阈值：RiskAllowance 放宽

- 页面入口：`#/shop-console`
- 命令模板（拿签名）：

```bash
DEADLINE=$(node -e 'console.log(Math.floor(Date.now()/1000)+3600)')
curl -sS "$WORKER_URL/risk-allowance?shopOwner=$DEPLOYER&maxItems=10&deadline=$DEADLINE"
```

期望：无签名时上架失败；带签名后上架成功。

## 6. 买家购买闭环（Buyer）

### B-01 ERC20 购买（不需要串号）

- 页面入口：`#/buyer`
- 期望：buy 成功；NFT mint；分润正确；Worker 能查到 purchase。
- 命令模板（以 demo 的 USDC 为例；USDC 地址以部署输出为准）：

```bash
export USDC_ADDRESS="0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0"
cast send --rpc-url "$RPC_URL" --private-key "$BUYER_PK" "$USDC_ADDRESS" \
  "approve(address,uint256)(bool)" "$ITEMS_ADDRESS" \
  0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff >/dev/null

cast send --rpc-url "$RPC_URL" --private-key "$BUYER_PK" "$ITEMS_ADDRESS" \
  "buy(uint256,uint256,address,bytes)(uint256)" 1 1 "$BUYER" 0x >/dev/null

curl -sS "$WORKER_API_URL/purchases?limit=1&include=enrich"
```

### B-02 需要串号的购买：SerialPermit（extraData）

- 页面入口：`#/buyer`
- 命令模板（从 Worker 获取 extraData 并购买）：

```bash
ITEM_ID=1
DEADLINE=$(node -e 'console.log(Math.floor(Date.now()/1000)+3600)')
EXTRA_DATA=$(curl -sS "$WORKER_URL/serial-permit?buyer=$BUYER&itemId=$ITEM_ID&serial=SERIAL-001&deadline=$DEADLINE" | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d.toString());process.stdout.write(j.extraData)})")

cast send --rpc-url "$RPC_URL" --private-key "$BUYER_PK" "$ITEMS_ADDRESS" \
  "buy(uint256,uint256,address,bytes)(uint256)" "$ITEM_ID" 1 "$BUYER" "$EXTRA_DATA" >/dev/null

curl -sS "$WORKER_API_URL/purchases?limit=5&include=enrich"
```

期望：purchases 列表出现新记录；包含 enrich 后的 shop/item 字段。

### B-03 串号过期（deadline 过期）

- 页面入口：`#/buyer`

```bash
ITEM_ID=1
DEADLINE=1
curl -sS "$WORKER_URL/serial-permit?buyer=$BUYER&itemId=$ITEM_ID&serial=SERIAL-EXPIRED&deadline=$DEADLINE"
```

期望：buy 时 revert（deadline 校验失败）。

### B-04 串号重放（nonce 重复）

- 页面入口：`#/buyer`

步骤：

1. 用同一个 `nonce` 生成 permit 并 buy 成功一次
2. 再用同一个 `extraData` 重复 buy

期望：第二次 revert（nonce 已用）。

### B-05 签名参数不匹配（buyer/itemId/serialHash 任意不一致）

- 页面入口：`#/buyer`

建议做法：

- 用 buyer=A 请求 serial-permit 得到 extraData
- 用 buyer=B（不同地址）调用 buy 传入该 extraData

期望：revert（签名校验失败）。

### B-06 店铺暂停后购买

- 页面入口：先 `#/shop-console` 暂停，再 `#/buyer` 购买
- 期望：buy revert（paused）。

### B-07 Action 不在白名单

- 页面入口：先 `#/protocol-console` deny action，再 `#/buyer` 购买
- 期望：buy revert（action not allowed）。

## 7. Query API 覆盖（回归关键）

### Q-01 shops/items 列表

- 页面入口：`#/plaza`

```bash
curl -sS "$WORKER_API_URL/shops?cursor=1&limit=20"
curl -sS "$WORKER_API_URL/items?cursor=1&limit=50"
```

### Q-02 purchases 走 indexer

```bash
curl -sS "$WORKER_API_URL/purchases?source=index&limit=20&include=enrich"
```

### Q-03 purchases 回退链上读取

```bash
curl -sS "$WORKER_API_URL/purchases?source=chain&limit=20&include=enrich"
```

期望：两者结果在可接受范围内一致（链上读取的窗口/排序可能不同，但记录应能对应）。
