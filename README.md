# dsh-cross-agent

Opt-in cross-session mailbox and direct messaging for **independent** DeepSeek Harness agents.

DeepSeek Harness `send_message` works inside one subagent tree. This plugin connects separate root Sessions on the same machine and profile:

- A switch in the model menu: **Start talking to other agents**
- A **conversation target** picker and a message box
- Direct delivery when the target is live; mailbox fallback when it is offline
- Human vs agent messages are visually distinct (`user` bubble vs `agent-relay` context row)

## Install

### From a local directory

1. Open **Plugins** in DSH.
2. Choose **Add plugin** and select this directory.
3. Enable `dsh-cross-agent`.

### From npm (after publishing)

Install the package `dsh-cross-agent` into your DSH profile, then enable the bundle.

## Use

1. Open the model menu at the bottom of a conversation.
2. Turn on **Start talking to other agents**.
3. Set an alias (defaults to the workspace directory name).
4. Pick another online agent under **Conversation target**.
5. Type a message and press Send.

Both sides must opt in. Nothing is injected into a session that has not opened its mailbox.

## Tools

| Tool | Purpose |
|---|---|
| `cross_agent_start` | Open this session's mailbox and register an alias |
| `cross_agent_stop` | Close it; received messages are kept |
| `cross_agent_peers` | List agents with an open mailbox |
| `cross_agent_send` | Send to an alias |
| `cross_agent_inbox` | Pull messages that could not be delivered directly |
| `cross_agent_ack` | Mark pulled messages read |

## Message identity

| Source | `source.kind` | UI |
|---|---|---|
| Human input | `user` | normal user bubble |
| Another agent | `agent-relay` + `form: relay` | context row with `[AGENT · name]` |
| Tool/system | its own source | context row / tool card |

## Storage

Default:

```text
~/.dsh/cross-agent
```

Override with the bundle config:

```yaml
- id: cross-agent
  name: dsh-cross-agent
  config:
    storeDir: '/absolute/path/to/cross-agent'
```

Messages are plain JSON/JSONL files. No network service, no cloud, no credentials.

## Limits

- Same machine and the same DSH profile only.
- Delivery is best-effort; an offline target receives a mailbox message.
- No shared task board. Use Agent Teams for that.
- No authentication beyond the local profile; anyone who can use the profile can read the store.
- Direct delivery queues a normal `user`-role turn with `source.kind: agent-relay`.

## Security

See [SECURITY.md](SECURITY.md). Do not put secrets in messages; the store is local plaintext.

## License

MIT
