import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { keyStore, looksLikeKey, MODELS } from '../llm/keyStore'

export function ApiKeyDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const current = useSyncExternalStore(keyStore.subscribe, keyStore.getSnapshot)
  const [key, setKey] = useState(current.key ?? '')
  const [show, setShow] = useState(false)
  const [model, setModel] = useState(current.settings.model)
  const [remember, setRemember] = useState(current.settings.remember)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.showModal()
    // showModal() focuses the first focusable (the Console link); start in the key field instead.
    input.current?.focus()
  }, [])

  const save = async () => {
    const k = key.trim()
    if (!looksLikeKey(k)) {
      setError('That doesn’t look like an Anthropic API key (it should start with “sk-ant-”).')
      return
    }
    setBusy(true)
    setError(null)
    try {
      // Verify with a free metadata call before saving, so typos surface here.
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const client = new Anthropic({ apiKey: k, dangerouslyAllowBrowser: true, maxRetries: 0 })
      await client.models.retrieve(model)
      keyStore.save(k, { model, remember })
      onClose()
    } catch (err) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      if (err instanceof Anthropic.AuthenticationError) setError('Anthropic rejected this key. Check that it was copied completely.')
      else if (err instanceof Anthropic.PermissionDeniedError) setError('This key doesn’t have access to that model.')
      else if (err instanceof Anthropic.NotFoundError) setError('That model isn’t available to this key. Try the other model.')
      else setError('Couldn’t reach the Anthropic API. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog ref={ref} className="dialog key-dialog" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <h2><KeyRound size={20} /> Claude API key</h2>
      <p className="small key-lead">
        You can explore the example essay without a key. To analyze your own writing with Claude, add your own Anthropic API key. You can create one in the{' '}
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">Anthropic Console</a>.
      </p>

      <label className="field">
        <span className="field-label">API key</span>
        <span className="key-input">
          <input
            ref={input}
            type={show ? 'text' : 'password'}
            value={key}
            placeholder="sk-ant-…"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
          <button type="button" className="icon-btn" aria-label={show ? 'Hide key' : 'Show key'} onClick={() => setShow(!show)}>
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </span>
      </label>

      <label className="field">
        <span className="field-label">Model</span>
        <select className="select" value={model} onChange={(e) => setModel(e.target.value)}>
          {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label} — {m.hint}</option>)}
        </select>
      </label>

      <label className="check small">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Remember on this device (otherwise it’s forgotten when you close the tab)
      </label>

      <ul className="key-notes small muted">
        <li>Your key is stored only in this browser and sent only to api.anthropic.com — never to this site.</li>
        <li>Usage is billed to your Anthropic account: a few short requests per paragraph you edit, and one larger request per Score evaluation.</li>
        <li>Don’t use this on a shared computer, or turn off “Remember”.</li>
      </ul>

      {error && <p className="status-error" role="alert">{error}</p>}

      <div className="dialog-actions">
        {current.key && (
          <button type="button" className="btn btn-danger-text" onClick={() => (keyStore.clear(), setKey(''), onClose())}>
            Remove key
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={busy || !key.trim()} onClick={save}>{busy ? 'Checking…' : 'Save'}</button>
      </div>
    </dialog>
  )
}
