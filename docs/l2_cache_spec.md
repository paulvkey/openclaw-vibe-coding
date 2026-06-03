# L2 Cache 设计规格说明书

文档版本：v1.0  
状态：Draft  
适用对象：多核处理器中的二级缓存（L2 Cache）子系统设计

---

## 1. 概述

### 1.1 背景

L2 Cache 位于 CPU 私有 L1 Cache 与共享 L3 Cache（或主存）之间，是多核处理器存储层级（Memory Hierarchy）中至关重要的一级。其核心目标是：在 L1 缺失（miss）时，以远低于访问主存的延迟提供数据，同时保持多核之间的数据一致性（cache coherence）。

### 1.2 设计目标

- **低延迟（Low Latency）**：命中（hit）情况下，期望访问延迟在 8~12 cycles。
- **高带宽（High Bandwidth）**：通过多 bank、多端口、流水线设计，支持单周期一次访问。
- **多核一致性（Coherence）**：实现 MESI 或 MOESI 协议，与 L1 / L3 / 其他核协同工作。
- **可配置性（Configurability）**：容量、相联度、行大小、替换策略均可参数化。
- **可验证性（Verifiability）**：明确的状态机与接口，便于功能/形式化验证。
- **低功耗（Power Efficient）**：通过 way prediction、bank gating 等手段降低动态功耗。

### 1.3 关键指标摘要

| 指标 | 目标值 |
| --- | --- |
| 容量（默认） | 512 KB / core 或 cluster |
| 相联度 | 8-way set-associative |
| Cache line size | 64 B |
| 命中延迟 | 8~12 cycles |
| 缺失惩罚（到 L3 命中） | 30~50 cycles |
| 一致性协议 | MESI（默认）/ MOESI（可选） |
| 总线接口 | AXI4（读写分离） |

---

## 2. 架构框图

### 2.1 系统层级（文字描述）

```
+---------+   +---------+        +---------+   +---------+
|  Core 0 |   |  Core 1 |   ...  |  Core N |   |  IO/DMA |
| L1I L1D |   | L1I L1D |        | L1I L1D |   |         |
+----+----+   +----+----+        +----+----+   +----+----+
     |             |                  |             |
     v             v                  v             v
   +-----------------------------------------------------+
   |               Coherence Interconnect                |
   |        (Snoop / Directory / Crossbar)               |
   +-----------------------------------------------------+
                          |
                          v
                +-----------------------+
                |       L2 Cache        |
                |  (本规格说明书对象)   |
                |  - Tag RAM            |
                |  - Data RAM (banked)  |
                |  - Controller FSM     |
                |  - MSHR / VB / WB     |
                |  - Prefetcher         |
                |  - Snoop Filter       |
                +-----------+-----------+
                            |
                            v  AXI4
                +-----------------------+
                |   L3 Cache / DRAM     |
                +-----------------------+
```

### 2.2 内部模块组成

L2 Cache 内部主要由以下子模块构成：

1. **Request Arbiter**：仲裁来自上游 L1（多核）和 Snoop 通道的请求。
2. **Tag Pipeline**：tag lookup、hit/miss 判定、way selection。
3. **Data Pipeline**：data RAM 访问、ECC 校验、数据合并。
4. **Cache Controller FSM**：核心状态机，调度命中、缺失填充、写回、监听等事件。
5. **MSHR（Miss Status Holding Register）**：跟踪未完成的缺失请求，支持 hit-under-miss / miss-under-miss。
6. **Victim Buffer / Write-Back Buffer**：暂存被替换的脏行，等待写回。
7. **Fill Buffer**：暂存从下游返回的填充数据，写入 data RAM。
8. **Snoop Filter**：减少不必要的上游 snoop 请求。
9. **Prefetcher**：硬件预取，包含 next-line 与 stride 预取器。
10. **Bus Interface Unit (BIU)**：AXI4 主接口，负责与 L3/DRAM 通信。

---

## 3. Cache 组织

### 3.1 基本参数（默认配置）

| 参数 | 默认值 | 备注 |
| --- | --- | --- |
| Cache size | 512 KB | 可配置 256KB/512KB/1MB/2MB |
| Associativity | 8-way | 可配置 4/8/16 |
| Line size | 64 B | 与 L1 line 对齐 |
| Number of sets | 1024 | = 512KB / (64B * 8) |
| Number of banks | 8 | 减少 bank 冲突 |
| Sub-block size | 16 B | 用于 critical-word-first |
| Read port | 1R | 流水化 |
| Write port | 1W | 流水化 |

### 3.2 容量计算

```
Number of sets = Cache_size / (Line_size × Associativity)
              = 524288 / (64 × 8)
              = 1024 sets
```

### 3.3 组相联映射

采用 set-associative 组织：每个 set 包含 8 个 way，地址通过 index 字段定位 set，通过比较 8 个 tag 字段确定命中 way。

---

## 4. 地址划分

### 4.1 物理地址字段

假设物理地址宽度 PA_WIDTH = 48 bit，Line size = 64B，Sets = 1024：

| 字段 | 位宽 | 位置 | 说明 |
| --- | --- | --- | --- |
| Tag | 32 bit | PA[47:16] | 用于比较命中的标签 |
| Index | 10 bit | PA[15:6]  | 选择 set，2^10 = 1024 sets |
| Offset | 6 bit | PA[5:0]   | line 内字节偏移，2^6 = 64B |

### 4.2 字段计算规则

```
Offset_bits = log2(Line_size)         = log2(64)   = 6
Index_bits  = log2(Number_of_sets)    = log2(1024) = 10
Tag_bits    = PA_WIDTH - Index_bits - Offset_bits = 48 - 10 - 6 = 32
```

### 4.3 地址划分图

```
 47                              16 15            6 5      0
+----------------------------------+---------------+--------+
|              Tag (32)            |  Index (10)   | Off (6)|
+----------------------------------+---------------+--------+
```

---

## 5. 控制器状态机

### 5.1 状态列表

L2 Cache Controller 顶层 FSM 定义如下状态：

| 状态 | 含义 |
| --- | --- |
| IDLE | 空闲，等待请求 |
| TAG_LOOKUP | 发起 tag 查找，等待比较结果 |
| HIT_SERVE | 命中，访问 data RAM 并返回响应 |
| MISS_FILL | 缺失，向下游发起 read 请求 |
| FILL_WAIT | 等待下游返回填充数据 |
| WRITEBACK | 命中替换脏行，将其写入 victim buffer |
| WB_WAIT | 等待 victim/WB 数据下发到下游 |
| SNOOP_INV | 接收外部 invalidate 请求，更新本地状态 |
| SNOOP_READ | 接收外部 read 监听，提供数据或转发 |
| ERROR | ECC 不可纠正 / 协议错误，进入错误处理 |

### 5.2 状态转换表

| 当前状态 | 触发条件 | 下一状态 | 主要动作 |
| --- | --- | --- | --- |
| IDLE | 收到上游请求 | TAG_LOOKUP | 锁存请求，启动 tag RAM 读 |
| IDLE | 收到 snoop 请求 | SNOOP_INV / SNOOP_READ | 仲裁器优先 snoop |
| TAG_LOOKUP | hit | HIT_SERVE | 选中 way，启动 data RAM |
| TAG_LOOKUP | miss & 替换行 clean | MISS_FILL | 分配 MSHR，发起 AXI read |
| TAG_LOOKUP | miss & 替换行 dirty | WRITEBACK | 写回脏行 + 发起 AXI read |
| HIT_SERVE | 数据就绪 | IDLE | 返回响应，更新 LRU |
| MISS_FILL | AXI read 完成 | FILL_WAIT | 接收 beat |
| FILL_WAIT | 全部 beat 接收完成 | HIT_SERVE | 写入 data RAM，转命中处理 |
| WRITEBACK | victim buffer 接收完成 | MISS_FILL | 启动后续填充 |
| WB_WAIT | AXI BRESP OKAY | IDLE | 释放 victim entry |
| SNOOP_INV | 状态更新完成 | IDLE | 返回 snoop response |
| SNOOP_READ | 数据返回完成 | IDLE | 视协议更新本地状态 |
| ERROR | 由上层处理 | IDLE | 触发中断/日志 |

### 5.3 状态机文字描述

- **IDLE → TAG_LOOKUP**：每个上游请求经 arbiter 后，FSM 在 IDLE 状态接受，并将请求 latch 到 pipeline register。  
- **TAG_LOOKUP → HIT_SERVE / MISS_FILL / WRITEBACK**：tag 比较结果决定路径。命中走 HIT_SERVE；缺失且替换 way 干净走 MISS_FILL；缺失且替换 way 脏走 WRITEBACK 串接 MISS_FILL。  
- **MISS_FILL → FILL_WAIT → HIT_SERVE**：缺失填充完成后，将填充数据合并旁路（critical word first）给请求者，同时写入 data RAM，更新 tag 状态为 E/M/S。  
- **SNOOP_***：snoop 请求与本地 pipeline 在 tag RAM 上具有更高优先级，避免本地命中后 snoop 错过最新状态。

---

## 6. Tag RAM 结构

### 6.1 单路（per-way）Tag entry

每个 way 的 tag entry 字段：

| 字段 | 位宽 | 说明 |
| --- | --- | --- |
| valid | 1 | 该行是否有效 |
| dirty | 1 | 是否脏（写回模式） |
| tag | 32 | 物理地址 tag 部分 |
| coherence_state | 2~3 | MESI: 2 bit；MOESI: 3 bit |
| ecc_tag | 7 | tag + 状态位的 ECC（SECDED） |

每路总宽：`1 + 1 + 32 + 2 + 7 = 43 bit`（MESI 配置）。

### 6.2 替换信息（per-set）

每个 set 共享：

| 字段 | 位宽 | 说明 |
| --- | --- | --- |
| plru_bits | 7 | 8-way Tree-PLRU，需要 (associativity - 1) bit |
| lock_bits | 8 | 可选：路锁定（way locking） |

### 6.3 Tag RAM 物理实现

- Tag RAM 采用 **8 个独立 bank**（每路一个），可并行比较。
- 实现选项：高密度 SRAM 或寄存器堆，依据工艺与频率目标选择。
- 支持 **dual-port**（一读一写）或 **1RW + 旁路**，需保证 snoop 与 lookup 不冲突。

---

## 7. Data RAM 结构

### 7.1 多 Bank 组织

Data RAM 采用多 bank 设计，以提升带宽并降低端口冲突：

| 参数 | 值 |
| --- | --- |
| Bank 数量 | 8 |
| 每 bank 容量 | 64 KB |
| 每 bank 数据宽度 | 64 B（一整行）或 16 B（sub-block） |
| Bank 选择策略 | 低位 index 哈希 / line address 取模 |

### 7.2 Bank Mapping

Bank 选择由 index 的低位决定：

```
bank_id = index[2:0]   // 8 banks, 3-bit selection
```

不同 set 落在不同 bank，可在背靠背请求中并行处理。

### 7.3 Sub-block 与 Critical-Word-First

每行 64 B，分为 4 个 16B sub-block：
- 缺失时按 sub-block beat 接收下游数据。
- 关键字（请求的 word 所在 sub-block）优先返回到 L1，降低 effective miss penalty。

### 7.4 ECC 保护

- 每 64 bit data 配 8 bit ECC（SECDED）。
- 写时 generate，读时 detect/correct。
- 不可纠正错误进入 ERROR 状态。

---

## 8. 流水线阶段

### 8.1 流水线划分

L2 Cache 命中路径采用 4 级流水线：

| Stage | 名称 | 主要工作 |
| --- | --- | --- |
| S0 | Address / Arbitration | 仲裁、地址分解、tag 索引 |
| S1 | Tag Lookup | 读取 tag RAM、比较、命中判断 |
| S2 | Data Access | 读取 data RAM、ECC 校验 |
| S3 | Response | 数据对齐、返回上游、更新 LRU |

### 8.2 时序约束

- 每级目标延迟 1~2 cycles。
- 命中总延迟（含 arbitration） 约 8~12 cycles（包含跨核互连开销）。
- Tag/Data 可并行启动（read），但 way mux 在 tag 比较结果出来后选通。

### 8.3 Hazard 与 Forwarding

- **结构性冒险**：同一 bank 的连续访问需 stall。
- **数据相关**：MSHR + write buffer 提供旁路，命中正在填充行时进入 secondary miss 合并。
- **Snoop 与 lookup 冲突**：snoop 在 S1 优先，lookup stall 一拍。

---

## 9. 替换策略

### 9.1 选择：Tree-based Pseudo-LRU（PLRU）

8-way 时使用 7 bit 的二叉树 PLRU：

```
                b0
              /    \
            b1      b2
           /  \    /  \
          b3  b4  b5  b6
         /\  /\  /\  /\
        w0 w1 w2 w3 w4 w5 w6 w7
```

- 每次访问 way_i，将路径上 bit 翻转为远离该 way。
- 替换时按 b0 → … → 叶子选择 victim way。

### 9.2 更新规则

| 访问 way | b0 翻转方向 | b1/b2 翻转 | b3..b6 翻转 |
| --- | --- | --- | --- |
| w0 | →1 | b1=1 | b3=1 |
| w1 | →1 | b1=1 | b3=0 |
| w2 | →1 | b1=0 | b4=1 |
| ... | ... | ... | ... |
| w7 | →0 | b2=0 | b6=0 |

（完整真值表略，按照标准 Tree-PLRU 算法生成）

### 9.3 备选策略

可参数化选择：
- **Random**：实现简单，性能稍差。
- **NRU（Not Recently Used）**：1 bit/way。
- **DRRIP（Dynamic Re-Reference Interval Prediction）**：用于抗扫描型工作负载。

---

## 10. 写策略

### 10.1 默认：Write-Back + Write-Allocate

- **Write-back**：写命中时仅更新 L2，置 dirty=1；脏行被替换时才写回下游，降低带宽消耗。
- **Write-allocate**：写缺失时先 fill 该行到 L2，再合并写入；与 write-back 配合最优。

### 10.2 部分写处理

- L1 写穿（write-through）或 L1 evict 携带的部分写：通过 byte-enable 合并到 fill buffer。
- 不允许部分写直接旁路到 L3，必须在 L2 完成 read-modify-write。

### 10.3 写顺序

- 同一地址写顺序由 MSHR 保序。
- 不同地址间无强序保证（除非来自同一上游通道）。
- AXI4 通过 ID 区分独立流。

---

## 11. 缓存一致性协议

### 11.1 状态定义（MESI）

| 状态 | 含义 |
| --- | --- |
| M（Modified） | 唯一拥有，已脏，写回时需更新主存 |
| E（Exclusive） | 唯一拥有，干净 |
| S（Shared） | 多核共享，干净 |
| I（Invalid） | 无效 |

### 11.2 状态转换表（核心场景）

| 当前状态 | 事件 | 下一状态 | 总线行为 |
| --- | --- | --- | --- |
| I | LocalRead miss | E（无其他副本）/ S（有其他副本） | BusRd |
| I | LocalWrite miss | M | BusRdX |
| E | LocalRead | E | — |
| E | LocalWrite | M | — |
| E | BusRd（snoop） | S | 提供数据 |
| E | BusRdX（snoop） | I | 提供数据并失效 |
| S | LocalRead | S | — |
| S | LocalWrite | M | BusUpgrade / BusRdX |
| S | BusRdX（snoop） | I | 失效 |
| M | LocalRead/Write | M | — |
| M | BusRd（snoop） | S | flush 数据，写回 |
| M | BusRdX（snoop） | I | flush 数据 |

### 11.3 MOESI 扩展（可选）

新增 **O（Owned）** 状态：脏但共享，避免立即写回，由 owner 提供数据。适合多核共享数据频繁修改的场景。

### 11.4 协议接口信号（对外）

| 信号 | 方向 | 含义 |
| --- | --- | --- |
| coh_req_type | in | BusRd / BusRdX / BusUpgrade / BusInv |
| coh_req_addr | in | 监听地址 |
| coh_resp_type | out | I-resp / S-resp / DataResp |
| coh_resp_data | out | 数据返回（M/E 命中时） |

---

## 12. 监听协议（Snoop）

### 12.1 Snoop Filter 设计

为减少不必要的 snoop 上传到 L1，引入 inclusive Snoop Filter：

- 结构：与 L1 等容、低相联度的目录表。
- 每条 entry：tag + valid + per-core present bits。
- 命中：仅向 present 核转发；未命中：忽略。

### 12.2 跨核监听流程

```
Core A: Store miss → L2 → 发出 BusRdX 到 Snoop Filter
Snoop Filter: 查找该地址 → 发现 Core B 持有 S
              → 仅向 Core B 发送 invalidate
Core B: L1 invalidate 完成 → ack
Snoop Filter: 收齐所有 ack → 通知 L2 fill
L2: 更新状态为 M，返回数据给 Core A
```

### 12.3 死锁避免

- snoop 请求与 fill 请求位于不同虚拟通道（VC）。
- snoop 在 L2 内具有更高优先级，避免循环等待。
- MSHR 设计限制最大 outstanding 请求数。

---

## 13. Victim Buffer 与 Fill Buffer

### 13.1 Victim Buffer（VB）

- 用途：暂存被替换的脏行，等待写回 L3。
- 容量：8~16 entries。
- 查询：上游请求需 CAM 查找 VB，命中则旁路。
- 写回时机：bus 空闲或满阈值触发。

### 13.2 Fill Buffer（FB）

- 用途：暂存从下游返回的填充 beats，待全部到齐再写入 data RAM。
- 容量：等于 MSHR 数量。
- 关键字优先：第一 beat 即可旁路给请求者。

### 13.3 MSHR 结构

| 字段 | 位宽 | 说明 |
| --- | --- | --- |
| valid | 1 | entry 有效 |
| addr | 42 | 缺失地址（line aligned） |
| req_type | 2 | Read / Write / Prefetch |
| requester_id | 4 | 上游请求方 |
| sub_block_mask | 4 | 已收到的 sub-block |
| merge_list | 16 | 合并的二级缺失指针 |

---

## 14. Write Buffer

### 14.1 功能

- 合并连续/重叠地址的写请求，降低对 data RAM 的端口压力。
- 延迟写回，给 read 让路。

### 14.2 结构

- 4~8 entry，每 entry 持有 1 line + byte-enable mask。
- 支持 store-merge：同一 line 的 partial write 合并。
- 支持 read-after-write 旁路：上游 read 命中 WB 时直接返回数据。

### 14.3 排空（Drain）策略

- 阈值排空：占用 ≥ 75% 时主动写回。
- Idle 排空：bus 空闲时机会写回。
- Fence 排空：遇到 memory barrier 强制全部排空。

---

## 15. 预取器

### 15.1 Next-line Prefetcher

- 命中地址 A，触发预取 A+1（下一 cache line）。
- 简单、低开销。
- 由置信度计数器控制是否激进预取。

### 15.2 Stride Prefetcher

- 跟踪每个 PC（或访问流）的步长。
- 表项：last_addr / stride / confidence。
- 预测访问 N 步之后的地址。

### 15.3 控制策略

- 预取请求降级为低优先级，不阻塞 demand 请求。
- 预取命中 hit 时升级为 demand line。
- 通过 Bloom Filter 过滤已存在的预取请求，避免重复。
- 提供性能计数器：prefetch_issued / prefetch_useful / prefetch_late。

---

## 16. 接口定义（AXI4）

### 16.1 L2 Cache 对外接口（与 L3/DRAM 通信）

采用 AXI4 协议，读写地址通道分离，支持 outstanding 事务。

#### 写地址通道（AW）

| 信号 | 位宽 | 说明 |
| --- | --- | --- |
| aw_id | 4 | 写事务 ID |
| aw_addr | 48 | 写地址 |
| aw_len | 8 | burst 长度（固定 15，即 16 beats = 64B） |
| aw_size | 3 | burst 大小（固定 3'b011 = 8B） |
| aw_burst | 2 | burst 类型（固定 INCR = 2'b01） |
| aw_valid | 1 | 地址有效 |
| aw_ready | 1 | 从机就绪 |

#### 写数据通道（W）

| 信号 | 位宽 | 说明 |
| --- | --- | --- |
| w_data | 512 | 写数据（64B = 512bit） |
| w_strb | 64 | byte 选通 |
| w_last | 1 | 最后一个 beat |
| w_valid | 1 | 数据有效 |
| w_ready | 1 | 从机就绪 |

#### 写响应通道（B）

| 信号 | 位宽 | 说明 |
| --- | --- | --- |
| b_id | 4 | 响应 ID（匹配 aw_id） |
| b_resp | 2 | 响应状态：OKAY / EXOKAY / SLVERR / DECERR |
| b_valid | 1 | 响应有效 |
| b_ready | 1 | 主机就绪 |

#### 读地址通道（AR）

| 信号 | 位宽 | 说明 |
| --- | --- | --- |
| ar_id | 4 | 读事务 ID |
| ar_addr | 48 | 读地址（line aligned） |
| ar_len | 8 | burst 长度（固定 15） |
| ar_size | 3 | burst 大小（3'b011 = 8B） |
| ar_burst | 2 | burst 类型（INCR） |
| ar_valid | 1 | 地址有效 |
| ar_ready | 1 | 从机就绪 |

#### 读数据通道（R）

| 信号 | 位宽 | 说明 |
| --- | --- | --- |
| r_id | 4 | 数据 ID（匹配 ar_id） |
| r_data | 512 | 读数据 |
| r_resp | 2 | 响应状态 |
| r_last | 1 | 最后一个 beat |
| r_valid | 1 | 数据有效 |
| r_ready | 1 | 主机就绪 |

### 16.2 L2 Cache 上游接口（与 L1 / Snoop 通信）

上游接口采用自定义的轻量级协议，打包为请求/响应对：

| 接口 | 方向 | 说明 |
| --- | --- | --- |
| l2_req_addr | in | 请求地址 |
| l2_req_type | in | Read / Write / Prefetch / Evict |
| l2_req_data | in | 写数据（Write 时有效）|
| l2_req_valid | in | 请求有效 |
| l2_req_ready | out | L2 就绪 |
| l2_rsp_data | out | 返回数据（Read 响应）|
| l2_rsp_status | out | Hit / Miss / Error |
| l2_rsp_valid | out | 响应有效 |
| l2_rsp_ready | in | 上游就绪 |

### 16.3 优先级仲裁

请求优先级（高→低）：

1. Snoop invalidate（保证一致性）
2. Snoop read（保证一致性）
3. Demand load（L1 缺失）
4. Demand store（L1 写缺失）
5. Prefetch（预取，最低）

---

## 17. 性能指标

### 17.1 时序指标

| 指标 | 典型值 | 说明 |
| --- | --- | --- |
| L2 命中延迟 | 8~12 cycles | 包含 arbitration + tag + data + response |
| L3 命中惩罚 | 30~50 cycles | L2 miss → L3 hit |
| DRAM 访问惩罚 | 100~300 cycles | 主存 |
| 缺失率 | 5~20% | 依赖工作负载 |
| 写回带宽 | 8 GB/s+ | 以 1GHz 频率估算 |
| 填充带宽 | 8 GB/s+ | burst read 带宽 |

### 17.2 性能计数器

| 计数器 | 说明 |
| --- | --- |
| l2_hits | L2 命中次数 |
| l2_misses | L2 缺失次数 |
| l2_writebacks | L2 写回次数 |
| l2_fills | L2 填充次数 |
| l2_snoop_inv | Snoop invalidate 次数 |
| l2_snoop_read | Snoop read 次数 |
| l2_prefetch_useful | 预取命中次数 |
| l2_prefetch_waste | 预取未使用次数 |
| l2_stall_cycles | 流水线停顿周期数 |

### 17.3 带宽计算

以 1GHz 频率为例：

```
单端口读取带宽 = 512bit × 1GHz = 64 GB/s
实际可用带宽（考虑 miss 惩罚）= 64 GB/s × hit_rate
```

---

## 18. 可配置参数

| 参数 | 类型 | 默认值 | 可选值 | 说明 |
| --- | --- | --- | --- | --- |
| CACHE_SIZE | int | 524288 | 262144 / 524288 / 1048576 / 2097152 | Cache 总容量（byte） |
| ASSOCIATIVITY | int | 8 | 4 / 8 / 16 | 每组路数 |
| LINE_SIZE | int | 64 | 32 / 64 / 128 | 每行字节数 |
| DATA_WIDTH | int | 512 | 256 / 512 / 1024 | Data RAM 位宽（bit） |
| ADDR_WIDTH | int | 48 | 32 / 40 / 48 | 物理地址宽度 |
| COHERENCE_PROTOCOL | string | "MESI" | "MESI" / "MOESI" | 一致性协议 |
| REPLACE_POLICY | string | "PLRU" | "PLRU" / "LRU" / "RRIP" | 替换策略 |
| PREFETCHER_TYPE | string | "next_line" | "none" / "next_line" / "stride" | 预取器类型 |
| MSHR_ENTRIES | int | 8 | 4 / 8 / 16 | MSHR 条目数 |
| VB_ENTRIES | int | 8 | 4 / 8 / 16 | Victim buffer 条目数 |
| WB_ENTRIES | int | 4 | 2 / 4 / 8 | Write buffer 条目数 |
| ECC_ENABLE | bool | true | true / false | 是否启用 ECC |
| SNOOP_FILTER_ENABLE | bool | true | true / false | 是否启用 Snoop filter |

---

## 19. 综合与实现考量

### 19.1 Timing Closure

| 路径 | 关键性 | 优化手段 |
| --- | --- | --- |
| Tag Compare | 高 | 8路并行比较器，retiming，高扇出走 local clock |
| Data RAM -> ECC | 中 | pipe stage 拆分 |
| WA hit -> way select | 高 | critical word first bypass |
| FSM critical path | 中 | 状态编码 one-hot，减少 decode logic |
| Arbiter | 中 | 菊花链优先编码器 |

### 19.2 Area 估算

以 512KB / 8-way 为例（28nm 工艺）：

| 组件 | 面积占比 | 说明 |
| --- | --- | --- |
| Data RAM | ~65% | 8 × 64KB SRAM 宏单元 |
| Tag RAM | ~15% | 8 × 43bit × 1024 word |
| Controller FSM | ~5% | 逻辑综合 |
| PLRU + MESI logic | ~3% | tiny |
| MSHR + VB + FB | ~5% | 寄存器为主 |
| Prefetcher | ~3% | 表 + 控制 |
| Misc（ECC, BIST, Wrapper） | ~4% | 测试接口与边界 |

Total 估计：~1.5~2.0 mm²（不含 wrapper 与 pad）

### 19.3 功耗优化

- **Clock Gating**：未访问的 bank 自动关断时钟。
- **Way Prediction**：使用 way 预测器，只读被预测的 way，降低 tag/data RAM 动态功耗。
- **Data RAM 分组**：只激活 hit 所在的 bank。
- **Power Gating (可选)**：长空闲时期关闭 L2 电源（retention 模式）。

---

## 20. 测试策略

### 20.1 验证计划

| 验证项 | 方法 | 覆盖目标 |
| --- | --- | --- |
| Hit/Miss 路径 | random directed test | 所有状态 |
| FSM 全覆盖 | formal / symbolic simulation | 100% state coverage |
| MESI 协议 | UVM scoreboard + snoop VIP | 所有状态转换 |
| AXI4 协议合规 | AXI4 VIP | 所有 AC 验证 |
| ECC 纠正 | fault injection | SECDED 行为 |
| 替换策略 | tracker checker | LRU/PLRU 序列 |
| 预取器 | trace-driven | prefetch accuracy |
| 多核监听 | 多核仿真环境 | snoop protocol |
| 边界与压力 | random test w/ constraints | 满 MSHR、满 WB |
| 形式化验证 | 断言 + 属性证明 | livelock / deadlock free |

### 20.2 覆盖率目标

| 类型 | 目标 |
| --- | --- |
| Line coverage | ≥ 95% |
| Branch / Condition | ≥ 90% |
| Toggle | ≥ 85% |
| FSM state transition | 100% |
| Functional coverage (assertion) | 100% 核心属性 |
| Protocol (AXI4 / snoop) | ≥ 95% |

### 20.3 自检 Testbench 结构

- UVM 环境：sequence → driver → monitor → scoreboard
- 支持 C-model reference 对比
- 支持 post-silicon trace replay

---

## 21. 参考文档

1. ~~Hennessy & Patterson, "Computer Architecture: A Quantitative Approach", 6th Ed.~~  
2. ~~ARM, "AMBA AXI and ACE Protocol Specification", ARM IHI 0022E~~  
3. ~~C. E. Cummings, "Simulation and Synthesis Techniques for Asynchronous FIFO Design", SNUG 2002~~  
4. ~~J. L. Hennessy & D. A. Patterson, "Cache Memory" related chapters~~  
5. ~~MESI (Illinois Protocol) / MOESI (AMD) protocol specifications~~  
6. ~~Intel, "Intel® 64 and IA-32 Architectures Optimization Reference Manual"~~  
7. ~~AMD, "Software Optimization Guide for AMD EPYC™ Processors"~~

---

## 附录 A：术语表

| 术语 | 说明 |
| --- | --- |
| L1 Cache | 一级缓存，CPU 私有，通常分为指令和数据 |
| L2 Cache | 二级缓存，本规格对象 |
| L3 Cache | 三级缓存，多核共享 |
| MESI | 四种 cache line 状态：Modified / Exclusive / Shared / Invalid |
| MOESI | 扩展协议，增加 Owned 状态 |
| MSHR | Miss Status Holding Register，缺失状态保持寄存器 |
| PLRU | Pseudo-LRU，伪 LRU 替换算法 |
| WB | Write-Buffer，写缓冲 |
| VB | Victim Buffer，受害缓冲 |
| AXI | AMBA Advanced eXtensible Interface |
| NUCA | Non-Uniform Cache Architecture |

## 附录 B：版本记录

| 版本 | 日期 | 修改内容 | 作者 |
| --- | --- | --- | --- |
| v0.1 | 2026-06-03 | 初稿 | Claude Code |
| v1.0 | TBD | 正式版 | TBD |

---

*文档结束*
