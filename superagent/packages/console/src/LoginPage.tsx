import { useState, type FormEvent } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { api, isDemoMode, type AuthSession } from './api'
import brandLockupDark from './assets/brand-lockup-dark.svg'
import brandLockupLight from './assets/brand-lockup-light.svg'

export function LoginPage({ onAuthenticated }: { onAuthenticated: (session: AuthSession) => void }) {
  const [rootApiKey, setRootApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const session = await api.login(rootApiKey)
      setRootApiKey('')
      onAuthenticated(session)
    } catch (reason) {
      setRootApiKey('')
      setError(reason instanceof Error ? reason.message : 'Login failed.')
    } finally {
      setBusy(false)
    }
  }

  return <main className="login-shell">
    <section className="login-card" aria-labelledby="login-title">
      <div className="login-brand"><img className="brand-lockup light-brand" src={brandLockupLight} alt="OpenViking" /><img className="brand-lockup dark-brand" src={brandLockupDark} alt="OpenViking" /></div>
      <div className="login-icon"><ShieldCheck size={24} /></div>
      <p className="eyebrow">ROOT KEY AUTHENTICATION</p>
      <h1 id="login-title">Sign in to OVSA Console</h1>
      <p className="login-description">Enter the <code>root_api_key</code> configured on this Console server. It is exchanged for an HttpOnly session cookie and is not saved in the browser.</p>
      {isDemoMode() && <p className="login-demo">Interactive mock demo · isolated data only</p>}
      <form onSubmit={submit}>
        <label htmlFor="root-api-key">Root API key</label>
        <div className="login-input"><KeyRound size={17} /><input id="root-api-key" type="password" value={rootApiKey} onChange={(event) => setRootApiKey(event.target.value)} autoComplete="current-password" autoFocus required disabled={busy} /></div>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button className="button primary login-submit" type="submit" disabled={busy || !rootApiKey}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </section>
  </main>
}
