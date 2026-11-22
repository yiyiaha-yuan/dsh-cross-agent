import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const DEFAULT_STORE = path.join(os.homedir(), '.dsh', 'cross-agent')
const ALIAS_MAX = 40
const MESSAGE_MAX = 8000
const INBOX_MAX = 50

// A plain tool definition is accepted by ctx.tools.register; avoid importing
// DSH-internal packages so this local bundle stays dependency-free.
const defineTool = (definition) => definition

function jsonOutput(schema) {
  return {
    schema,
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
  }
}

function caller(exec, tool) {
  if (!exec.agent?.id) throw new Error(`${tool} requires a calling agent`)
  return exec.agent.id
}

function storeDir(config) {
  const dir = config?.storeDir || DEFAULT_STORE
  return path.resolve(dir)
}

function keyOf(id) {
  return Buffer.from(id, 'utf8').toString('base64url')
}

function paths(root) {
  return {
    peers: path.join(root, 'peers'),
    inbox: path.join(root, 'inbox'),
    seen: path.join(root, 'seen'),
    aliases: path.join(root, 'aliases'),
  }
}

async function ensure(root) {
  const p = paths(root)
  await Promise.all([
    fs.mkdir(p.peers, { recursive: true }),
    fs.mkdir(p.inbox, { recursive: true }),
    fs.mkdir(p.seen, { recursive: true }),
    fs.mkdir(p.aliases, { recursive: true }),
  ])
  return p
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await fs.rename(tmp, file)
}

async function listPeers(root) {
  const p = await ensure(root)
  const names = await fs.readdir(p.peers).catch(() => [])
  const out = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    const row = await readJson(path.join(p.peers, name), null)
    if (row && typeof row.id === 'string' && typeof row.alias === 'string') out.push(row)
  }
  return out.sort((a, b) => a.alias.localeCompare(b.alias, 'zh'))
}

function peerView(row) {
  return { alias: row.alias, id: row.id, startedAt: row.startedAt }
}

async function findPeer(root, to) {
  const peers = await listPeers(root)
  const exact = peers.find((row) => row.alias === to)
  if (exact) return exact
  const lower = peers.find((row) => row.alias.toLowerCase() === String(to).toLowerCase())
  if (lower) return lower
  return peers.find((row) => row.id === to)
}

async function peerState(root, id) {
  const p = await ensure(root)
  const row = await readJson(path.join(p.peers, `${keyOf(id)}.json`), null)
  return row
    ? { enabled: true, alias: row.alias, sessionId: id, store: root }
    : { enabled: false, alias: null, sessionId: id, store: root }
}

async function enablePeer(root, id, alias) {
  const p = await ensure(root)
  const existing = await readJson(path.join(p.peers, `${keyOf(id)}.json`), null)
  const remembered = await readJson(path.join(p.aliases, `${keyOf(id)}.json`), null)
  const nextAlias = String(alias || existing?.alias || remembered?.alias || `agent-${id.slice(-8)}`).trim()
  const peers = await listPeers(root)
  const conflict = peers.find((row) => row.alias.toLowerCase() === nextAlias.toLowerCase() && row.id !== id)
  if (conflict) throw new Error(`alias "${nextAlias}" is already used by ${conflict.id}`)
  const row = { alias: nextAlias, id, startedAt: existing?.startedAt || new Date().toISOString() }
  await writeJson(path.join(p.peers, `${keyOf(id)}.json`), row)
  await writeJson(path.join(p.aliases, `${keyOf(id)}.json`), { alias: nextAlias })
  return row
}

async function disablePeer(root, id) {
  const p = await ensure(root)
  const file = path.join(p.peers, `${keyOf(id)}.json`)
  const existing = await readJson(file, null)
  if (existing?.alias) await writeJson(path.join(p.aliases, `${keyOf(id)}.json`), { alias: existing.alias })
  const existed = await fs.stat(file).then(() => true).catch(() => false)
  await fs.unlink(file).catch(() => {})
  return existed
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 64 * 1024) throw new Error('request body too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

async function deliverToAgent(ctx, toId, text, fromAlias) {
  const target = ctx.agents.get(toId)
  if (!target) return false
  try {
    await target.followup({
      id: `cross-${randomUUID()}`,
      role: 'user',
      content: [{
        type: 'text',
        text: `[AGENT · ${fromAlias}]\n${text}\n\n回复请在“启动与其他 agent 沟通”里选择对方；或调用 cross_agent_send。`,
      }],
      source: {
        kind: 'agent-relay',
        form: 'relay',
        fromAlias,
      },
    })
    return true
  } catch {
    return false
  }
}

async function readLines(file) {
  try {
    return (await fs.readFile(file, 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line) } catch { return null }
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

async function appendLine(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.appendFile(file, `${JSON.stringify(value)}\n`, 'utf8')
}

async function readSeen(root, id) {
  const p = await ensure(root)
  const value = await readJson(path.join(p.seen, `${keyOf(id)}.json`), { ids: [] })
  return new Set(Array.isArray(value.ids) ? value.ids : [])
}

async function writeSeen(root, id, ids) {
  const p = await ensure(root)
  await writeJson(path.join(p.seen, `${keyOf(id)}.json`), { ids: [...ids].slice(-5000) })
}

const PEER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['alias', 'id', 'startedAt'],
  properties: {
    alias: { type: 'string', },
    id: { type: 'string', },
    startedAt: { type: 'string', },
  },
}

const PEERS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['peers'],
  properties: {
    peers: { type: 'array', items: PEER_SCHEMA },
  },
}

const START_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['started', 'alias', 'id', 'store', 'peers'],
  properties: {
    started: { type: 'boolean', },
    alias: { type: 'string', },
    id: { type: 'string', },
    store: { type: 'string', },
    peers: { type: 'array', items: PEER_SCHEMA },
  },
}

const SEND_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['sent', 'message_id', 'to', 'created_at', 'delivered'],
  properties: {
    sent: { type: 'boolean', },
    message_id: { type: 'string', },
    to: { type: 'string', },
    created_at: { type: 'string', },
    delivered: { type: 'boolean', },
  },
}

const MESSAGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'from', 'from_alias', 'text', 'created_at', 'read'],
  properties: {
    id: { type: 'string', },
    from: { type: 'string', },
    from_alias: { type: 'string', },
    text: { type: 'string', },
    created_at: { type: 'string', },
    read: { type: 'boolean', },
  },
}

const INBOX_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['messages', 'unread'],
  properties: {
    messages: { type: 'array', items: MESSAGE_SCHEMA },
    unread: { type: 'integer', },
  },
}

const ACK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['acked'],
  properties: { acked: { type: 'integer', } },
}

const STOP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['stopped'],
  properties: { stopped: { type: 'boolean' } },
}

export const inject = ['tools', 'webServer', 'agents']

export function apply(ctx, config = {}) {
  const root = storeDir(config)

  ctx.tools.register(defineTool({
    name: 'cross_agent_start',
    description: 'Open the cross-session mailbox for this session and register an alias. Other independent sessions can then send messages to this alias. Call this once per session; starting again updates the alias. This is the opt-in switch.',
    parameters: {
      alias: {
        type: 'string',
        required: true,
        description: 'Short unique name, 1-40 chars, e.g. "知识库" or "kb".',
      },
    },
    output: jsonOutput(START_SCHEMA),
    async execute(args, exec) {
      const id = caller(exec, 'cross_agent_start')
      const alias = String(args.alias ?? '').trim()
      if (!alias || alias.length > ALIAS_MAX) throw new Error(`alias must be 1-${ALIAS_MAX} characters`)
      const p = await ensure(root)
      const peers = await listPeers(root)
      const conflict = peers.find((row) => row.alias.toLowerCase() === alias.toLowerCase() && row.id !== id)
      if (conflict) throw new Error(`alias "${alias}" is already used by ${conflict.id}`)
      const row = { alias, id, startedAt: new Date().toISOString() }
      await writeJson(path.join(p.peers, `${keyOf(id)}.json`), row)
      await writeJson(path.join(p.aliases, `${keyOf(id)}.json`), { alias })
      const next = await listPeers(root)
      return { started: true, alias, id, store: root, peers: next.map(peerView) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'cross_agent_stop',
    description: 'Close this session\'s cross-session mailbox. Messages already received are retained; the session can start again later.',
    parameters: {},
    output: jsonOutput(STOP_SCHEMA),
    async execute(_args, exec) {
      const id = caller(exec, 'cross_agent_stop')
      const p = await ensure(root)
      const file = path.join(p.peers, `${keyOf(id)}.json`)
      const existed = await fs.stat(file).then(() => true).catch(() => false)
      await fs.unlink(file).catch(() => {})
      return { stopped: existed }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'cross_agent_peers',
    description: 'List sessions that currently have the cross-session mailbox open. Use the alias with cross_agent_send.',
    parameters: {},
    output: jsonOutput(PEERS_SCHEMA),
    isConcurrencySafe: () => true,
    async execute() {
      return { peers: (await listPeers(root)).map(peerView) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'cross_agent_send',
    description: 'Send one asynchronous message to another independent session by alias. The recipient reads it with cross_agent_inbox; this does not interrupt or auto-inject into that session.',
    parameters: {
      to: { type: 'string', required: true, description: 'Recipient alias from cross_agent_peers.' },
      message: { type: 'string', required: true, description: `Message text, max ${MESSAGE_MAX} chars.` },
    },
    output: jsonOutput(SEND_SCHEMA),
    async execute(args, exec) {
      const id = caller(exec, 'cross_agent_send')
      const text = String(args.message ?? '').trim()
      if (!text) throw new Error('message must not be empty')
      if (text.length > MESSAGE_MAX) throw new Error(`message exceeds ${MESSAGE_MAX} characters`)
      const p = await ensure(root)
      const self = await readJson(path.join(p.peers, `${keyOf(id)}.json`), null)
      if (!self) throw new Error('call cross_agent_start before sending')
      const to = await findPeer(root, String(args.to ?? '').trim())
      if (!to) throw new Error(`recipient not found: ${args.to}`)
      const row = {
        id: randomUUID(),
        from: id,
        from_alias: self.alias,
        to: to.id,
        text,
        created_at: new Date().toISOString(),
        delivered: false,
      }
      row.delivered = await deliverToAgent(ctx, to.id, text, self.alias)
      if (!row.delivered) await appendLine(path.join(p.inbox, `${keyOf(to.id)}.jsonl`), row)
      return { sent: true, message_id: row.id, to: to.alias, created_at: row.created_at, delivered: row.delivered }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'cross_agent_inbox',
    description: 'Read messages sent to this session\'s mailbox, newest last. Unread messages stay unread until cross_agent_ack. This is pull-based; call it when you expect a reply.',
    parameters: {
      limit: { type: 'integer', description: `Max messages, 1-${INBOX_MAX}; default 20.` },
      unread_only: { type: 'boolean', description: 'Default true; set false to include already-read messages.' },
    },
    output: jsonOutput(INBOX_SCHEMA),
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const id = caller(exec, 'cross_agent_inbox')
      const p = await ensure(root)
      const self = await readJson(path.join(p.peers, `${keyOf(id)}.json`), null)
      if (!self) throw new Error('call cross_agent_start before reading')
      const limit = Math.min(INBOX_MAX, Math.max(1, args.limit ?? 20))
      const seen = await readSeen(root, id)
      const all = (await readLines(path.join(p.inbox, `${keyOf(id)}.jsonl`)))
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      const visible = all.filter((row) => args.unread_only === false || !seen.has(row.id))
      const messages = visible.slice(-limit).map((row) => ({
        id: row.id,
        from: row.from,
        from_alias: row.from_alias,
        text: row.text,
        created_at: row.created_at,
        read: seen.has(row.id),
      }))
      return { messages, unread: all.filter((row) => !seen.has(row.id)).length }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'cross_agent_ack',
    description: 'Mark received messages as read after acting on them. Idempotent; acknowledged ids stay read.',
    parameters: {
      ids: { type: 'array', required: true, items: { type: 'string' }, description: 'Message ids from cross_agent_inbox.' },
    },
    output: jsonOutput(ACK_SCHEMA),
    async execute(args, exec) {
      const id = caller(exec, 'cross_agent_ack')
      const p = await ensure(root)
      const seen = await readSeen(root, id)
      for (const messageId of args.ids) {
        if (typeof messageId === 'string' && messageId) seen.add(messageId)
      }
      await writeSeen(root, id, seen)
      return { acked: args.ids.length }
    },
  }))

  const peersRoute = ctx.webServer.register({
    kind: 'exact',
    path: '/cross-agent/peers',
    handler: async (req, res) => {
      try {
        return sendJson(res, 200, { peers: (await listPeers(root)).map(peerView) })
      } catch (error) {
        return sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  })

  const sendRoute = ctx.webServer.register({
    kind: 'exact',
    path: '/cross-agent/send',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST required' })
        const body = JSON.parse(await readBody(req))
        const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
        const toAlias = typeof body.to === 'string' ? body.to.trim() : ''
        const text = typeof body.message === 'string' ? body.message.trim() : ''
        if (!sessionId || !toAlias || !text) return sendJson(res, 400, { error: 'sessionId, to and message are required' })
        if (text.length > MESSAGE_MAX) return sendJson(res, 400, { error: `message exceeds ${MESSAGE_MAX} characters` })
        const p = await ensure(root)
        const self = await readJson(path.join(p.peers, `${keyOf(sessionId)}.json`), null)
        if (!self) return sendJson(res, 409, { error: 'open the mailbox before sending' })
        const to = await findPeer(root, toAlias)
        if (!to) return sendJson(res, 404, { error: `recipient not found: ${toAlias}` })
        const row = {
          id: randomUUID(),
          from: sessionId,
          from_alias: self.alias,
          to: to.id,
          text,
          created_at: new Date().toISOString(),
          delivered: false,
        }
        row.delivered = await deliverToAgent(ctx, to.id, text, self.alias)
        if (!row.delivered) await appendLine(path.join(p.inbox, `${keyOf(to.id)}.jsonl`), row)
        return sendJson(res, 200, { sent: true, message_id: row.id, to: to.alias, created_at: row.created_at, delivered: row.delivered })
      } catch (error) {
        return sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  })

  const stateRoute = ctx.webServer.register({
    kind: 'exact',
    path: '/cross-agent/state',
    handler: async (req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://cross-agent.local')
        const sessionId = url.searchParams.get('sessionId') || ''
        if (!sessionId) return sendJson(res, 400, { error: 'sessionId is required' })
        return sendJson(res, 200, await peerState(root, sessionId))
      } catch (error) {
        return sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  })

  const toggleRoute = ctx.webServer.register({
    kind: 'exact',
    path: '/cross-agent/toggle',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST required' })
        const body = JSON.parse(await readBody(req))
        const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
        if (!sessionId) return sendJson(res, 400, { error: 'sessionId is required' })
        if (body.enabled === false) {
          await disablePeer(root, sessionId)
          return sendJson(res, 200, await peerState(root, sessionId))
        }
        await enablePeer(root, sessionId, typeof body.alias === 'string' ? body.alias : undefined)
        return sendJson(res, 200, await peerState(root, sessionId))
      } catch (error) {
        return sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  })

  ctx.effect(() => () => {
    peersRoute()
    sendRoute()
    stateRoute()
    toggleRoute()
  }, 'cross-agent: web routes')
}

