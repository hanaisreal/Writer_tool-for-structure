// Google OAuth 2.0 (authorization-code flow) for app login.
// Tokens never reach the browser: the server exchanges the code, reads the
// profile, and keeps only { name, email, picture } in a signed session cookie.

import { randomBytes } from 'node:crypto'
import type { Request, Response, NextFunction, Router } from 'express'
import express from 'express'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'

export interface SessionUser {
  name: string
  email: string
  picture?: string
}

declare global {
  namespace CookieSessionInterfaces {
    interface CookieSessionObject {
      user?: SessionUser
      oauthState?: string
    }
  }
}

export const authConfig = {
  clientId: process.env.GOOGLE_CLIENT_ID ?? '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  appOrigin: process.env.APP_ORIGIN ?? 'http://localhost:5173',
  get enabled() {
    return Boolean(this.clientId && this.clientSecret)
  },
  get redirectUri() {
    return `${this.appOrigin}/auth/google/callback`
  },
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!authConfig.enabled || req.session?.user) return next()
  res.status(401).json({ error: 'Not signed in' })
}

export function authRouter(): Router {
  const r = express.Router()

  r.get('/google', (req, res) => {
    if (!authConfig.enabled) {
      res.status(503).send('Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.')
      return
    }
    const state = randomBytes(16).toString('hex')
    req.session!.oauthState = state
    const url = new URL(AUTH_URL)
    url.search = new URLSearchParams({
      client_id: authConfig.clientId,
      redirect_uri: authConfig.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    }).toString()
    res.redirect(url.toString())
  })

  r.get('/google/callback', async (req, res) => {
    const { code, state, error } = req.query as Record<string, string | undefined>
    const expected = req.session?.oauthState
    if (req.session) req.session.oauthState = undefined
    if (error) {
      res.redirect(`/?auth_error=${encodeURIComponent(error)}`)
      return
    }
    if (!code || !state || state !== expected) {
      res.redirect('/?auth_error=invalid_state')
      return
    }
    try {
      const tokenRes = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: authConfig.clientId,
          client_secret: authConfig.clientSecret,
          redirect_uri: authConfig.redirectUri,
          grant_type: 'authorization_code',
        }),
      })
      if (!tokenRes.ok) throw new Error(`token exchange failed: ${tokenRes.status}`)
      const { access_token } = (await tokenRes.json()) as { access_token: string }

      const infoRes = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${access_token}` } })
      if (!infoRes.ok) throw new Error(`userinfo failed: ${infoRes.status}`)
      const info = (await infoRes.json()) as { name?: string; email?: string; picture?: string }

      req.session!.user = { name: info.name ?? info.email ?? 'Writer', email: info.email ?? '', picture: info.picture }
      res.redirect('/')
    } catch (err) {
      console.error('[auth]', err)
      res.redirect('/?auth_error=exchange_failed')
    }
  })

  r.post('/logout', (req, res) => {
    req.session = null
    res.status(204).end()
  })

  return r
}
