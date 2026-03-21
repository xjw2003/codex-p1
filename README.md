# codex-im

## 本次更新重点（与你当前诉求对应）

1. 支持直接调用 VS Code 插件版 Codex  
通过 `CODEX_IM_CODEX_COMMAND` 指向 VS Code 插件目录下的 `codex.exe`，不依赖独立的 `codex-app-server`。

2. 可强制走 VPN 代理端口（无需开启系统全局代理）  
通过 `CODEX_IM_PROXY_URL` 注入 `HTTP_PROXY / HTTPS_PROXY / ALL_PROXY / WS_PROXY / WSS_PROXY`，仅影响本项目拉起的 Codex/VSCode 进程链路，不影响你电脑其他应用的联网方式。

3. 飞书可见运行状态与超时原因判断  
发送消息后，如果超过 `CODEX_IM_INACTIVITY_TIMEOUT_MS`（默认 60000ms）无可见进展，会自动在飞书提示原因（如：等待授权、Codex 连接异常、飞书连接异常、仍在执行、状态未确定），便于你决定是否重试或停止。

4. 代码改动完成后自动回报“改了哪些文件”  
当一轮任务结束（completed/failed）且发生文件修改时，飞书会额外发送“本轮代码改动”清单（文件路径 + 变更类型）。

### 关键环境变量示例

```env
# 强制代理（仅本项目链路）
CODEX_IM_PROXY_URL=http://127.0.0.1:7897

# VS Code 插件版 Codex 可执行文件（示例路径）
CODEX_IM_CODEX_COMMAND=C:\Users\你的用户名\.vscode\extensions\openai.chatgpt-xxx-win32-x64\bin\windows-x86_64\codex.exe

# 可选：启动机器人时自动拉起 VS Code
CODEX_IM_VSCODE_COMMAND=F:\Microsoft VS Code\Code.exe
CODEX_IM_VSCODE_LAUNCH_ON_START=true
CODEX_IM_VSCODE_KILL_BEFORE_LAUNCH=true

# 无进展超时阈值（毫秒）
CODEX_IM_INACTIVITY_TIMEOUT_MS=60000
```

本项目完全通过Vibe Coding实现，主要特点：手机聊的电脑能继续聊，电脑聊的手机也能继续聊。在手机上可以使用命令或飞书的卡片来进行交互，快速切换项目和线程

`codex-im` 是一个本地运行的飞书机器人桥接层：

`飞书消息 -> 本机 codex app-server -> 飞书回复`

Codex 操作都留在 本地，飞书只负责消息交互。

## 特性

- 飞书长连接机器人
- 普通对话回复
- 卡片回复与流式更新
- 先加表情、后输出正文
- 回复到触发它的原消息
- `/codex bind` 绑定项目
- `/codex where` 查看当前项目/线程
- `/codex workspace` 查看当前会话已记录项目和线程
- `/codex remove /绝对路径` 移除会话绑定项目
- `/codex send <相对文件路径>` 发送当前绑定项目内的文件
- `/codex switch <threadId>` 切换线程
- `/codex message` 查看最近几轮消息
- `/codex new` 新建线程
- `/codex stop` 停止当前运行
- `/codex model` / `/codex model update` / `/codex model <modelId>` 查看可用模型、刷新可用模型以及推理强度、设置模型
- `/codex effort` / `/codex effort <low|medium|high|xhigh>` 设置推理强度
- `/codex approve` / `/codex reject` 审批卡片

## 安装

npm安装和执行：

```sh
npm install -g @vdug/codex-im
codex-im feishu-bot
```

开发态运行：

```sh
npm install
npm run feishu-bot
```

### 执行脚本示例

```bash
#!/usr/bin/env bash
set -euo pipefail
npm install -g @vdug/codex-im
codex-im feishu-bot
```

## 配置

有两个配置文件：.env 和 sessions.json

 `.env`。

程序会按这个顺序加载配置：

1. 当前目录下的 `.env`
2. `~/.codex-im/.env`
3. 当前 shell 环境变量


以下是默认读取 session 文件位置，也可以通过 .env 的配置指定

```text
~/.codex-im/sessions.json
```

必填环境变量：

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `CODEX_IM_DEFAULT_CODEX_MODEL` 新绑定项目时默认写入的模型（启动时会基于 Codex 可用模型列表校验，不合法则启动失败）
- `CODEX_IM_DEFAULT_CODEX_EFFORT` 新绑定项目时默认写入的推理强度（启动时会基于对应模型可用推理强度校验，不合法则启动失败）
- `CODEX_IM_DEFAULT_CODEX_ACCESS_MODE` 默认访问模式（必填：`default` / `full-access`）

可选环境变量：

- `CODEX_IM_PROXY_URL` 代理地址快捷配置。设置后会自动写入 `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` / `WS_PROXY` / `WSS_PROXY`
- `CODEX_IM_DEFAULT_WORKSPACE_ID` 在session中读取当前绑定信息的key，更换key后，原来的信息虽然在session中，但是不会再读取
- `CODEX_IM_FEISHU_STREAMING_OUTPUT`（默认 `true`，设为 `false` 则等 Codex 完成后一次性输出）
- `CODEX_IM_WORKSPACE_ALLOWLIST`允许绑定的项目白名单
- `CODEX_IM_CODEX_ENDPOINT` 用来指定 Codex 的远程 WebSocket RPC 地址，默认是启动本地服务
- `CODEX_IM_VSCODE_COMMAND` VSCode 可执行文件路径
- `CODEX_IM_VSCODE_LAUNCH_ON_START` 启动 `codex-im` 时自动拉起 VSCode
- `CODEX_IM_VSCODE_KILL_BEFORE_LAUNCH` 自动启动 VSCode 前先关闭已有 `Code.exe`
- `CODEX_IM_SESSIONS_FILE` session文件路径

### 代理与 VSCode 启动示例

如果你不想打开系统代理，可以直接在 `.env` 中配置：

```env
CODEX_IM_PROXY_URL=http://127.0.0.1:7897
CODEX_IM_CODEX_COMMAND=C:\Users\你的用户名\.vscode\extensions\openai.chatgpt-xxx-win32-x64\bin\windows-x86_64\codex.exe
CODEX_IM_VSCODE_COMMAND=F:\Microsoft VS Code\Code.exe
CODEX_IM_VSCODE_LAUNCH_ON_START=true
CODEX_IM_VSCODE_KILL_BEFORE_LAUNCH=true
```

这样 `npm run feishu-bot` 启动时会：

1. 给 Codex app-server 注入代理环境变量
2. 先关闭已有 VSCode，再重新拉起 `Code.exe`
3. 让飞书侧和 VSCode 插件侧都运行在同一套代理环境下




## 使用

```sh
npm run feishu-bot
```

常用命令：

- `/codex bind /绝对路径`
- `/codex where`
- `/codex workspace`
- `/codex remove /绝对路径`
- `/codex send <相对文件路径>`
- `/codex switch <threadId>`
- `/codex message`
- `/codex new`
- `/codex stop`
- `/codex model`
- `/codex model update`
- `/codex effort`
- `/codex approve`
- `/codex approve session`
- `/codex reject`
- `/codex help`

## 项目与线程模型

- 一个飞书会话可以记住多个项目
- 每个项目对应一个当前选中的 Codex 线程
- 历史线程列表以 Codex `thread/list` 为准
- 切换项目或线程后，后续普通消息继续发到当前线程

## 工作方式

- 收到用户消息后，先用表情标记正在处理
- Codex 返回内容后，飞书中以卡片形式持续更新
- 命令回执和普通对话都会优先回复到触发它的原消息
- 审批请求会显示为交互卡片

## 开发

- `src/index.js`: 启动入口
- `src/feishu-bot.js`: 飞书机器人主逻辑
- `src/codex-rpc-client.js`: Codex JSON-RPC 传输层
- `src/session-store.js`: 会话绑定持久化
- `src/config.js`: 环境变量配置


# 飞书配置

1. 在飞书平台创建机器人

2. 事件权限配置

| 名称 | 标识 |
| --- | --- |
| 消息被 reaction | `im.message.reaction.created_v1` |
| 消息被取消 reaction | `im.message.reaction.deleted_v1` |
| 接收消息 | `im.message.receive_v1` |

3. 回调配置

| 名称 | 标识 |
| --- | --- |
| 卡片回传交互 | `card.action.trigger` |

4. 应用权限

| 名称 | 标识 |
| --- | --- |
| 获取卡片信息 | `cardkit:card:read` |
| 创建与更新卡片 | `cardkit:card:write` |
| 获取与更新用户基本信息 | `contact:user.base:readonly` |
| 读取用户发给机器人的单聊消息 | `im:message.p2p_msg:readonly` |
| 以应用身份发消息 | `im:message:send_as_bot` |
| 发送删除表情回复 | `im:message.reactions:write_only` |
| 获取与上传图片或文件资源 | `im:resource` |



# 参考项目
https://github.com/larksuite/openclaw-lark

https://github.com/Emanuele-web04/remodex

https://github.com/Dimillian/CodexMonitor

https://github.com/vduggg/codex-im
