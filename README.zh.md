# 中文说明

`dsh-cross-agent` 是 DeepSeek Harness 的**跨会话信箱**插件，用来连接同一台机器、同一个 DSH profile 下的两个独立会话。

## 功能

- 模型菜单里的开关：**启动与其他 agent 沟通**
- 选择对话对象，直接输入并发送
- 对方在线时直接推进会话；离线时落到本地信箱
- 人类消息仍是普通用户气泡；agent 消息显示为 `[AGENT · 名字]` 的 context 行

## 安装

在 DSH 的 **插件 / Plugins** 里选择 **Add plugin**，选中本目录，然后启用 `dsh-cross-agent`。

## 使用

1. 打开会话底部的模型菜单
2. 打开「启动与其他 agent 沟通」
3. 设置别名（默认取工作目录名）
4. 在「对话对象」里选择另一个在线 agent
5. 输入消息并发送

两边都必须主动打开开关。没有打开信箱的会话不会收到任何注入。

## 边界

- 只支持同机、同一个 DSH profile
- 不是实时聊天，对方离线时要等它下次运行后拉取
- 没有共享任务板；任务协作请用 Agent Teams
- 消息按本地明文 JSON 存储，不要放密钥

## 工具

`cross_agent_start` / `cross_agent_stop` / `cross_agent_peers` / `cross_agent_send` / `cross_agent_inbox` / `cross_agent_ack`

## 许可

MIT
