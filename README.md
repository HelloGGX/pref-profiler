# perf-profiler

面向 harness 工程的检查点式性能检测工具。用 `perf_hooks` 时间线记录启动、查询、headless 等阶段的关键检查点，输出两类报告：

- 人类可读的文本时间线（含 RSS / Heap 内存快照、TTFT 分解、慢操作告警）
- **AI 友好的结构化 JSON**：检查点、阶段耗时、异常（severity + 原因 + 阈值）、瓶颈排名和**可直接执行的修复建议**，供 AI / 自动化快速定位和修复性能问题

零运行时依赖，使用 [bun](https://bun.sh)（>= 1.3）打包为单个二进制。

## 构建与运行

```bash
bun run build        # 等价于 bun build ./src/cli.ts --compile --minify
                     # 产物：Windows 为 bin/perf-profiler.exe，macOS/Linux 为 bin/perf-profiler
```

```bash
./bin/perf-profiler --help            # Windows: .\bin\perf-profiler.exe --help
./bin/perf-profiler demo --query      # 演示 + 文本报告
./bin/perf-profiler demo --query --json   # 演示 + AI 友好 JSON 报告
```

开发时也可以不编译：`bun run dev`（等价于 `bun run ./src/cli.ts`）。`package.json` 的 `bin` 字段直接指向 `bin/` 中的二进制，构建后执行 `bun link` 即可全局使用 `perf-profiler` 命令。

## CLI 用法

### demo - 生成演示报告

```bash
perf-profiler demo --startup                     # 启动检测演示（默认）
perf-profiler demo --query                       # 查询管线演示（TTFT 分解）
perf-profiler demo --headless                    # 非交互模式逐轮延迟演示
perf-profiler demo --session-id test1 --out /tmp/perf
```

加 `--json` 时直接输出 AI 友好报告（见下文「AI 报告」）。

### report - 读取检测报告

详细模式写入的报告在 `<config-home>/reports/` 下，包含 `.txt`（人类可读）和 `.json`（AI 友好）两个文件：

```bash
perf-profiler report                             # 扫描默认输出目录
perf-profiler report --dir /tmp/perf             # 指定目录（按修改时间倒序）
perf-profiler report /path/to/x.json             # 直接指定文件
perf-profiler report --dir /tmp/perf --json      # 只输出原始 JSON，便于管道给 AI/harness
```

### run - 检测任意命令

用同一条 perf_hooks 时间线包裹任意命令：

```bash
perf-profiler run -- node script.js arg1
perf-profiler run -- npm test
perf-profiler run --json -- npm test             # 输出 AI 友好 JSON
```

命令直接以 `spawn(..., { shell: false })` 执行（不经过 shell，参数不做二次解析）。Windows 上如需 shell 特性或 `.cmd`/`.bat` 包装脚本，请显式使用 `cmd /c` 或 `powershell -Command`。子进程退出码原样透传；退出码非 0 会作为 critical 异常写入报告。CPU / 峰值 RSS 仅在 Linux 上通过 `/proc` 采样。

## AI 报告（harness 集成）

`--json` 输出遵循固定 schema，AI 可以直接消费：

```json
{
  "schema": "perf-profiler/report@1",
  "generatedAt": "2026-08-06T12:00:00.000Z",
  "sessionId": "abc-123",
  "mode": "query",
  "totals": { "totalMs": 733.7, "checkpointCount": 19 },
  "checkpoints": [
    { "name": "query_user_input_received", "totalMs": 0, "deltaMs": 0, "rssBytes": 52848230, "heapUsedBytes": 6029304 }
  ],
  "phases": [
    { "name": "Tool schemas", "start": "query_tool_schema_build_start", "end": "query_tool_schema_build_end", "durationMs": 78, "sharePct": 10.6 }
  ],
  "anomalies": [
    {
      "severity": "warning",
      "checkpoint": "query_tool_schema_build_end",
      "durationMs": 78,
      "thresholdMs": 50,
      "reason": "Known bottleneck \"query_tool_schema_build_end\" exceeds 50ms",
      "suggestion": "Cache tool schemas or build them lazily instead of regenerating per query."
    }
  ],
  "bottlenecks": [
    { "name": "Network TTFB", "durationMs": 171, "sharePct": 23.3, "suggestion": "Check endpoint latency, connection keep-alive, compression, and request timeouts." }
  ],
  "summary": "TTFT 437.8ms: pre-request overhead 268.6ms (61.4%), network latency 169.2ms (38.6%)",
  "suggestions": [
    "Cache tool schemas or build them lazily instead of regenerating per query.",
    "Check endpoint latency, connection keep-alive, compression, and request timeouts."
  ]
}
```

关键字段：

| 字段 | 说明 |
| --- | --- |
| `checkpoints` | 每个检查点的累计耗时 / 相邻间隔 / 内存快照（详细模式） |
| `phases` | 语义化阶段（context loading、tool schemas、network TTFB…）及占比 |
| `anomalies` | 自动检测的异常：`severity`（critical/warning/info）、原因、阈值、修复建议 |
| `bottlenecks` | 按耗时排序的前 5 个阶段，各带针对性建议 |
| `summary` | 一句话总结（如 TTFT 中网络延迟 vs 本地开销的占比） |
| `suggestions` | 去重后的修复建议列表，AI 可直接按序执行 |

异常阈值：

| 条件 | 严重度 |
| --- | --- |
| 检查点间隔 > 1000ms | critical |
| 检查点间隔 > 100ms | warning |
| 已知瓶颈（tool schema / client creation / git status）> 50ms | warning |
| 查询网络延迟 > 1000ms（query 模式） | critical |
| 查询网络延迟 > 300ms（query 模式） | warning |
| 首次响应 TTFR > 2000ms（headless 模式） | critical |
| 堆内存 > 512MB | warning |

## 作为库使用

```ts
import { profileCheckpoint, profileReport, getStartupAiReport } from 'perf-profiler'

// 任意初始化阶段打点（需先设 PERF_PROFILE_STARTUP=1）
profileCheckpoint('app_entry')
profileCheckpoint('app_imports_loaded')
profileReport() // 写 <output-dir>/<sessionId>.txt 和 .json

const report = getStartupAiReport() // 直接拿 AI 友好 JSON 数据
```

```ts
import { startQueryProfile, queryCheckpoint, endQueryProfile, getQueryAiReport } from 'perf-profiler'
startQueryProfile()
queryCheckpoint('query_context_loading_start')
// ... 查询管线各阶段
queryCheckpoint('query_first_chunk_received') // TTFT
endQueryProfile()
const report = getQueryAiReport()
```

```ts
import {
  setNonInteractiveSession,
  headlessProfilerStartTurn,
  headlessProfilerCheckpoint,
  getHeadlessAiReport,
} from 'perf-profiler'
setNonInteractiveSession(true)
headlessProfilerStartTurn()
headlessProfilerCheckpoint('query_started')
headlessProfilerCheckpoint('first_chunk')
const report = getHeadlessAiReport()
```

遥测默认完全关闭；如需上报指标，可用 `setAnalyticsSink((event, metadata) => ...)` 挂接（事件名 `startup_perf` / `headless_latency`）。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `PERF_PROFILE_STARTUP=1` | 开启详细启动 / headless 检测（确定性启用，无采样） |
| `PERF_PROFILE_QUERY=1` | 开启查询检测 |
| `PERF_OUTPUT_DIR=<dir>` | 报告输出目录（默认 `<config-home>/reports`） |
| `PERF_CONFIG_DIR=<dir>` | 配置目录（默认 `~/.perf-profiler`） |
| `PERF_DEBUG=1` / `--debug` | 调试日志输出到 stderr |

## 测试

```bash
bun test ./test/smoke.test.js
```
