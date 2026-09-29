import { Check, Eye, EyeOff, KeyRound } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { keyStore, PROVIDERS, type ProviderId } from '../llm/keyStore'
import { verifyKey } from '../llm/provider'

const CUSTOM = '__custom__'

export function ApiKeyDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const current = useSyncExternalStore(keyStore.subscribe, keyStore.getSnapshot)
  const [provider, setProvider] = useState<ProviderId>(current.settings.provider)
  const info = PROVIDERS[provider]
  const [key, setKey] = useState(current.keys[provider] ?? '')
  const [show, setShow] = useState(false)
  const savedModel = current.settings.models[provider]
  const [model, setModel] = useState(savedModel)
  const [custom, setCustom] = useState(!info.models.some((m) => m.id === savedModel))
  const [remember, setRemember] = useState(current.settings.remember)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ref.current?.showModal()
    // showModal() focuses the first focusable element; start in the key field instead.
    input.current?.focus()
  }, [])

  const switchTo = (p: ProviderId) => {
    setProvider(p)
    setKey(current.keys[p] ?? '')
    const m = current.settings.models[p]
    setModel(m)
    setCustom(!PROVIDERS[p].models.some((x) => x.id === m))
    setError(null)
    input.current?.focus()
  }

  const save = async () => {
    const k = key.trim()
    const m = model.trim()
    if (!info.looksLikeKey(k)) {
      setError(provider === 'anthropic' ? 'That doesn’t look like an Anthropic API key (it should start with “sk-ant-”).' : 'That doesn’t look like an OpenAI API key (it should start with “sk-”).')
      return
    }
    if (!m) {
      setError('Enter a model name.')
      return
    }
    setBusy(true)
    setError(null)
    const problem = await verifyKey(provider, k, m)
    setBusy(false)
    if (problem) {
      setError(problem)
      return
    }
    keyStore.save(provider, k, m, remember)
    onClose()
  }

  return (
    <dialog ref={ref} className="dialog key-dialog" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <h2><KeyRound size={20} /> API key</h2>
      <p className="small key-lead">
        You can explore the example essay without a key. To analyze your own writing, add your own Anthropic or OpenAI API key.
      </p>

      <div className="segmented provider-tabs" role="tablist" aria-label="Provider">
        {(Object.keys(PROVIDERS) as ProviderId[]).map((p) => (
          <button key={p} type="button" role="tab" aria-selected={provider === p} className={provider === p ? 'is-on' : ''} onClick={() => switchTo(p)}>
            {PROVIDERS[p].label}
            {current.keys[p] && <Check size={14} className="tab-check" aria-label="key saved" />}
          </button>
        ))}
      </div>

      <label className="field">
        <span className="field-label">
          {info.label} API key ·{' '}
          <a href={info.consoleUrl} target="_blank" rel="noreferrer">get one</a>
        </span>
        <span className="key-input">
          <input
            ref={input}
            type={show ? 'text' : 'password'}
            value={key}
            placeholder={info.placeholder}
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
        <select
          className="select"
          value={custom ? CUSTOM : model}
          onChange={(e) => {
            const v = e.target.value
            setCustom(v === CUSTOM)
            if (v !== CUSTOM) setModel(v)
          }}
        >
          {info.models.map((m) => <option key={m.id} value={m.id}>{m.label} — {m.hint}</option>)}
          <option value={CUSTOM}>Other model…</option>
        </select>
        {custom && (
          <input className="select model-input" value={model} placeholder="Model id, e.g. gpt-5.2" spellCheck={false} onChange={(e) => setModel(e.target.value)} />
        )}
      </label>

      <label className="check small">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Remember on this device (otherwise it’s forgotten when you close the tab)
      </label>

      <ul className="key-notes small muted">
        <li>Your key is stored only in this browser and sent only to {info.host} — never to this site.</li>
        <li>Usage is billed to your {info.label} account: a few short requests per paragraph you edit, and two larger ones each time you run Evaluate & comment.</li>
        <li>With keys for both, the one you save last is used. Don’t use this on a shared computer, or turn off “Remember”.</li>
      </ul>

      {error && <p className="status-error" role="alert">{error}</p>}

      <div className="dialog-actions">
        {current.keys[provider] && (
          <button type="button" className="btn btn-danger-text" onClick={() => (keyStore.clear(provider), setKey(''))}>
            Remove {info.label} key
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={busy || !key.trim()} onClick={save}>
          {busy ? 'Checking…' : current.settings.provider === provider || !current.key ? 'Save' : `Save & use ${info.label}`}
        </button>
      </div>
    </dialog>
  )
}
