# 跨会话信箱

## 它解决什么

DSH 的 `send_message` 只能发给同一 subagent 树里的成员。两个独立根会话（例如“主 agent”和“知识库 agent”）互相看不到。

这个插件给它们一个**共享文件信箱**：

- 每个会话用 `cross_agent_start` 主动打开开关；
- 按 alias 发消息；
- 对方用 `cross_agent_inbox` 拉取；
- 不打断、不自动注入、不合并会话。

## 启动开关

`cross_agent_start` 就是开关。没有启动的会话不会被列出，也不能收发。

## 限制

- 同一台机器、同一个 DSH profile；
- 异步，不是实时聊天；
- 没有共享任务板；任务仍走 Agent Teams / 文件；
- 消息内容不自动执行。
