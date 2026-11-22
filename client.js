window.__ModuleLoader__.load({
  id: 'dsh-cross-agent',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const rowStyle = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: '8px 12px',
      minHeight: 44,
    }
    const labelStyle = { fontSize: 13, lineHeight: '18px' }
    const hintStyle = { fontSize: 11, lineHeight: '15px', opacity: 0.6 }
    const fieldStyle = {
      width: '100%',
      boxSizing: 'border-box',
      border: '1px solid rgba(127,127,127,.3)',
      borderRadius: 8,
      padding: '6px 8px',
      fontSize: 12,
      background: 'transparent',
      color: 'inherit',
      outline: 'none',
    }
    const buttonStyle = {
      border: 0,
      borderRadius: 8,
      padding: '6px 10px',
      fontSize: 12,
      cursor: 'pointer',
      background: '#2f7cf6',
      color: '#fff',
      flex: '0 0 auto',
    }

    function CrossAgentToggle(props) {
      const sessionId = props.sessionId
      const isChild = props.useSession((snapshot) => snapshot.subagent !== null)
        || props.useSessions((state) => state.byId[sessionId]?.origin === 'subagent')
      const cwd = props.useSessions((state) => state.byId[sessionId]?.cwd)
      const fallbackAlias = cwd ? cwd.split(/[\\/]/).filter(Boolean).pop() || '' : ''
      const [state, setState] = React.useState({
        loading: true,
        enabled: false,
        alias: null,
        aliasDraft: '',
        peers: [],
        target: '',
        draft: '',
        sending: false,
        error: null,
        notice: null,
      })

      const refresh = React.useCallback(async () => {
        const [stateResponse, peersResponse] = await Promise.all([
          fetch(`/cross-agent/state?sessionId=${encodeURIComponent(sessionId)}`, { cache: 'no-store' }),
          fetch('/cross-agent/peers', { cache: 'no-store' }),
        ])
        const current = await stateResponse.json()
        const peerData = await peersResponse.json()
        setState((old) => ({
          ...old,
          loading: false,
          enabled: current.enabled === true,
          alias: current.alias || null,
          aliasDraft: current.alias || old.aliasDraft || fallbackAlias,
          peers: Array.isArray(peerData.peers)
            ? peerData.peers.filter((peer) => peer.alias !== current.alias)
            : [],
          target: old.target || '',
          error: null,
        }))
      }, [sessionId, fallbackAlias])

      React.useEffect(() => {
        if (isChild) return
        let alive = true
        refresh().catch((error) => {
          if (alive) setState((old) => ({ ...old, loading: false, error: error instanceof Error ? error.message : String(error) }))
        })
        return () => { alive = false }
      }, [isChild, refresh])

      if (isChild) return null

      const toggle = async () => {
        if (state.loading) return
        const next = !state.enabled
        setState((old) => ({ ...old, loading: true, error: null, notice: null }))
        try {
          const response = await fetch('/cross-agent/toggle', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              enabled: next,
              alias: state.alias || state.aliasDraft || fallbackAlias,
            }),
          })
          const value = await response.json()
          if (value.error) throw new Error(value.error)
          setState((old) => ({ ...old, loading: false, enabled: value.enabled === true, alias: value.alias || null, target: next ? old.target : '', notice: null }))
          await refresh()
        } catch (error) {
          setState((old) => ({ ...old, loading: false, error: error instanceof Error ? error.message : String(error) }))
        }
      }

      const send = async () => {
        const text = state.draft.trim()
        if (!state.target || !text || state.sending) return
        setState((old) => ({ ...old, sending: true, error: null, notice: null }))
        try {
          const response = await fetch('/cross-agent/send', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId, to: state.target, message: text }),
          })
          const value = await response.json()
          if (value.error) throw new Error(value.error)
          setState((old) => ({
            ...old,
            sending: false,
            draft: '',
            notice: value.delivered ? `已送达 ${value.to}` : `已放入 ${value.to} 的信箱`,
          }))
          await refresh()
        } catch (error) {
          setState((old) => ({ ...old, sending: false, error: error instanceof Error ? error.message : String(error) }))
        }
      }

      const rename = async () => {
        const alias = state.aliasDraft.trim()
        if (!alias || state.loading) return
        setState((old) => ({ ...old, loading: true, error: null, notice: null }))
        try {
          const response = await fetch('/cross-agent/toggle', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId, enabled: true, alias }),
          })
          const value = await response.json()
          if (value.error) throw new Error(value.error)
          setState((old) => ({ ...old, loading: false, alias: value.alias || alias, notice: `别名已改为 ${value.alias || alias}` }))
          await refresh()
        } catch (error) {
          setState((old) => ({ ...old, loading: false, error: error instanceof Error ? error.message : String(error) }))
        }
      }

      const peers = state.peers
      const target = state.target || peers[0]?.alias || ''

      return h('div', { style: { padding: '4px 12px 10px' } }, [
        h('div', { key: 'row', style: rowStyle }, [
          h('div', { key: 'copy', style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 } }, [
            h('span', { key: 'label', style: labelStyle }, '启动与其他 agent 沟通'),
            h('span', { key: 'hint', style: hintStyle },
              state.error ? state.error : state.alias ? `别名：${state.alias}` : '关闭时不会收发消息'),
          ]),
          h('button', {
            key: 'switch',
            type: 'button',
            role: 'switch',
            'aria-checked': state.enabled,
            'aria-label': '启动与其他 agent 沟通',
            disabled: state.loading,
            onClick: toggle,
            style: {
              width: 36,
              height: 20,
              padding: 0,
              border: 0,
              borderRadius: 999,
              cursor: state.loading ? 'default' : 'pointer',
              background: state.enabled ? '#2f7cf6' : 'rgba(127,127,127,.35)',
              position: 'relative',
              transition: 'background .15s ease',
              flex: '0 0 auto',
            },
          }, h('span', {
            key: 'knob',
            style: {
              position: 'absolute',
              top: 2,
              left: state.enabled ? 18 : 2,
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: '#fff',
              boxShadow: '0 1px 2px rgba(0,0,0,.25)',
              transition: 'left .15s ease',
            },
          })),
        ]),
        state.enabled ? h('div', { key: 'compose', style: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 } }, [
          h('div', { key: 'alias', style: { display: 'flex', gap: 8, alignItems: 'center' } }, [
            h('span', { key: 'alias-label', style: { ...hintStyle, flex: '0 0 auto' } }, '别名'),
            h('input', {
              key: 'alias-input',
              value: state.aliasDraft,
              placeholder: fallbackAlias || '给这个 agent 起个名字',
              onChange: (event) => setState((old) => ({ ...old, aliasDraft: event.target.value })),
              onKeyDown: (event) => {
                if (event.key === 'Enter' && !event.nativeEvent?.isComposing) {
                  event.preventDefault()
                  void rename()
                }
              },
              style: { ...fieldStyle, flex: 1, minWidth: 0 },
            }),
            h('button', {
              key: 'alias-save',
              type: 'button',
              disabled: state.loading || !state.aliasDraft.trim(),
              onClick: () => void rename(),
              style: { ...buttonStyle, opacity: state.loading || !state.aliasDraft.trim() ? 0.45 : 1 },
            }, '改名'),
          ]),
          h('div', { key: 'to', style: { display: 'flex', gap: 8, alignItems: 'center' } }, [
            h('span', { key: 'to-label', style: { ...hintStyle, flex: '0 0 auto' } }, '对话对象'),
            peers.length === 0
              ? h('span', { key: 'empty', style: hintStyle }, '暂无其他 agent')
              : h('select', {
                key: 'select',
                value: target,
                onChange: (event) => setState((old) => ({ ...old, target: event.target.value })),
                style: { ...fieldStyle, flex: 1, minWidth: 0 },
              }, peers.map((peer) => h('option', { key: peer.alias, value: peer.alias }, peer.alias))),
          ]),
          h('div', { key: 'message', style: { display: 'flex', gap: 6, alignItems: 'center' } }, [
            h('input', {
              key: 'input',
              value: state.draft,
              placeholder: target ? `发给 ${target}…` : '先让对方打开开关',
              onChange: (event) => setState((old) => ({ ...old, draft: event.target.value })),
              onKeyDown: (event) => {
                if (event.key === 'Enter' && !event.nativeEvent?.isComposing) {
                  event.preventDefault()
                  void send()
                }
              },
              style: { ...fieldStyle, flex: 1, minWidth: 0 },
            }),
            h('button', {
              key: 'send',
              type: 'button',
              disabled: state.sending || !target || !state.draft.trim(),
              onClick: () => void send(),
              style: { ...buttonStyle, opacity: state.sending || !target || !state.draft.trim() ? 0.45 : 1 },
            }, state.sending ? '发送中' : '发送'),
          ]),
          state.notice ? h('span', { key: 'notice', style: { ...hintStyle, color: '#2f7cf6' } }, state.notice) : null,
        ]) : null,
      ])
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.input.model.options', () => ctx.slots.register({
          name: 'conversation.input.model.options',
          id: 'cross-agent-mailbox',
          order: 10,
        }, CrossAgentToggle))
      },
    }
  },
})
