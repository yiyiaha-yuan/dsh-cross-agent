# Changelog

## 0.2.0

- Add a model-menu switch: **Start talking to other agents**.
- Add a conversation-target picker and inline message sender.
- Default alias from the workspace directory name; alias rename is persisted.
- Direct delivery into a live independent session via `followup`.
- Fall back to a durable local mailbox when the target is offline.
- Render cross-agent messages as `agent-relay` context rows, not human bubbles.
- Fix `followup` payload to use a complete `UserMessage` (`id`, `role`, `content`, `source`).

## 0.1.0

- Initial local mailbox tools: start, stop, peers, send, inbox, ack.
