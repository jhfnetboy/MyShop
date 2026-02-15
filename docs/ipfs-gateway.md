# IPFS 网关与 Pin 服务（独立设计文档）

## 设计目标

- 对外接口稳定：统一以 `https://<gateway>/ipfs/<CID>/<path>` 访问，内部实现可替换（Go/Node/Rust）
- 去中心化运维：平台、社区、店主共同运行节点与 Cluster，提升冗余与可用性
- 可审计与监控：可达性、哈希一致性、响应延迟与错误率可观测

## 对外接口与兼容

- HTTP Gateway 路径约定：`/ipfs/<CID>` 与 `/ipns/<name>`
- Header 建议：`Cache-Control`, `ETag`（CID），`Content-Type` 根据文件类型自动识别
- 负载均衡：Nginx/HAProxy 按健康检查转发到多个后端网关节点
- 多网关策略：前端支持逗号分隔的 `IPFS_GATEWAY` 列表，主/备回退

## 内部实现选项

- Go/Kubo（go-ipfs）：成熟与主流；支持 HTTP Gateway 与 API
- Node Gateways：适配特定生态；配合反向代理与缓存层
- Rust 实现：追求高性能与资源占用优化（需评估社区成熟度）
- Cluster：统一 Pin 管理；设置 `replication_factor_min/max`；多 peer 托管

## 运行组件

- 网关节点：运行 Kubo（或其他实现），开启 Gateway 与 API；挂载本地数据目录（SSD 优先）
- 反向代理：Nginx/HAProxy 统一入口；TLS 终止；健康检查与故障转移
- Cluster：cluster-service + cluster-ctl；平台维护 peers；社区/店主加入提升副本
- 监控：Prometheus + Grafana；采集节点状态与 HTTP 指标
- 审计：定期对关键 CID 进行哈希一致性与多网关可达性检查

## 运维流程

1. 发布新文档/页面到 IPFS，得到 CID
2. 将 CID 加入 Cluster Pin 列表，设置副本数
3. 更新前端或 MYSHOP_CATEGORIES_JSON 中的 `*Ipfs` 链接
4. 在验收环境中验证：
   - 通过主/备网关均可访问
   - 响应头与内容一致性符合预期

## 安全与合规

- 访问限流与防刷：在反向代理层进行速率限制
- 内容控制：遵循当地法律法规与平台政策（在入口层进行筛选）
- 日志与隐私：仅记录必要的访问元数据，避免泄露敏感内容

## 与 MyShop 集成

- 前端配置：`VITE_IPFS_GATEWAY` 支持列表（逗号分隔），页面“查看文档”展示主/备链接
- Worker 类别元数据：承载 `docsIpfs/readmeIpfs/architectureIpfs/templateIpfs` 字段
- 验收文档：要求验证主/备网关可用与一致性
 - 可选性：不配置 IPFS 时，使用中心化 `http(s)` 资源，原有流程照常运行

## 演进与替换

- 内部实现可替换：Go → Node/Rust 或混合部署；只要对外维持 `/ipfs/<CID>` 接口即可
- 可加缓存层：如 CDN/代理缓存；保持 CID 驱动的缓存失效策略

## 参考

- Kubo (go-ipfs): https://docs.ipfs.tech
- IPFS Cluster: https://cluster.ipfs.io

## Kubernetes 部署示例（Ingress + 多节点 Kubo/Cluster）

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: ipfs
spec:
  serviceName: ipfs
  replicas: 3
  selector:
    matchLabels:
      app: ipfs
  template:
    metadata:
      labels:
        app: ipfs
    spec:
      containers:
        - name: ipfs
          image: ipfs/kubo:latest
          ports:
            - containerPort: 5001 # API
            - containerPort: 4001 # Swarm
            - containerPort: 8080 # Gateway
          volumeMounts:
            - name: ipfs-data
              mountPath: /data/ipfs
      volumes:
        - name: ipfs-data
          persistentVolumeClaim:
            claimName: ipfs-pvc
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ipfs-cluster
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ipfs-cluster
  template:
    metadata:
      labels:
        app: ipfs-cluster
    spec:
      containers:
        - name: cluster
          image: ipfs/ipfs-cluster:latest
          env:
            - name: CLUSTER_REPLICATIONFACTORMIN
              value: "2"
            - name: CLUSTER_REPLICATIONFACTORMAX
              value: "4"
          ports:
            - containerPort: 9094 # API
---
apiVersion: v1
kind: Service
metadata:
  name: ipfs-gateway
spec:
  selector:
    app: ipfs
  ports:
    - name: gateway
      port: 8080
      targetPort: 8080
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ipfs-gateway
  annotations:
    kubernetes.io/ingress.class: "nginx"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "600"
spec:
  tls:
    - hosts:
        - gw.community.org
      secretName: gw-cert
  rules:
    - host: gw.community.org
      http:
        paths:
          - path: /ipfs
            pathType: Prefix
            backend:
              service:
                name: ipfs-gateway
                port:
                  number: 8080
```

注意：
- 建议为 StatefulSet 提供独立 PVC（按节点分配），并绑定 SSD 存储类
- Ingress 层提供 TLS 与限流；可扩展为使用多 Service（多网关）进行负载均衡
