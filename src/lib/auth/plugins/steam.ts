import { createAuthEndpoint } from '@better-auth/core/api'
import { betterFetch } from '@better-fetch/fetch'
import { setSessionCookie } from 'better-auth/cookies'
import { handleOAuthUserInfo, parseState } from 'better-auth/oauth2'
import * as z from 'zod'

const STEAM_OPENID = 'https://steamcommunity.com/openid/login'
const STEAM_ID_RE = /\/openid\/id\/(\d+)$/

export type SteamPluginOptions = {
  apiKey: string
}

function buildSteamLoginUrl(returnTo: string, realm: string) {
  const url = new URL(STEAM_OPENID)
  url.searchParams.set('openid.ns', 'http://specs.openid.net/auth/2.0')
  url.searchParams.set('openid.mode', 'checkid_setup')
  url.searchParams.set('openid.return_to', returnTo)
  url.searchParams.set('openid.realm', realm)
  url.searchParams.set('openid.identity', 'http://specs.openid.net/auth/2.0/identifier_select')
  url.searchParams.set('openid.claimed_id', 'http://specs.openid.net/auth/2.0/identifier_select')
  return url
}

async function verifySteamOpenId(params: URLSearchParams, returnTo: string) {
  const verifyParams = new URLSearchParams()
  for (const [key, value] of params.entries()) {
    if (key.startsWith('openid.')) verifyParams.set(key, value)
  }
  verifyParams.set('openid.mode', 'check_authentication')

  const { data } = await betterFetch<string>(STEAM_OPENID, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: verifyParams.toString(),
  })

  const body = typeof data === 'string' ? data : ''
  if (!body.includes('is_valid:true')) return null

  const claimedId = params.get('openid.claimed_id') ?? params.get('openid.identity')
  if (!claimedId) return null

  const match = claimedId.match(STEAM_ID_RE)
  if (!match) return null

  const responseReturnTo = params.get('openid.return_to')
  if (responseReturnTo && responseReturnTo !== returnTo) return null

  return match[1]
}

async function fetchSteamProfile(apiKey: string, steamId: string) {
  const { data } = await betterFetch<{
    response?: { players?: Array<{ personaname?: string; avatarfull?: string }> }
  }>(
    `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${encodeURIComponent(apiKey)}&steamids=${steamId}`,
    { method: 'GET' },
  )

  return data?.response?.players?.[0]
}

/** Steam OpenID 登录（Better Auth 无内置 Steam provider） */
export function steamOpenId(options: SteamPluginOptions) {
  const providerId = 'steam'

  return {
    id: 'steam-openid',
    version: '1.0.0',
    init(ctx: { baseURL: string; origin?: string }) {
      const realm = ctx.origin ?? new URL(ctx.baseURL).origin
      const callbackPath = `${ctx.baseURL}/steam/callback`

      return {
        context: {
          socialProviders: [
            {
              id: providerId,
              name: 'Steam',
              createAuthorizationURL({ state }: { state: string }) {
                return buildSteamLoginUrl(`${callbackPath}?state=${encodeURIComponent(state)}`, realm)
              },
              async validateAuthorizationCode() {
                throw new Error('Steam uses OpenID callback at /steam/callback')
              },
              async getUserInfo() {
                return null
              },
              options: { apiKey: options.apiKey },
            },
          ],
        },
      }
    },
    endpoints: {
      steamCallback: createAuthEndpoint(
        '/steam/callback',
        {
          method: 'GET',
          query: z.record(z.string(), z.string().optional()),
        },
        async (c) => {
          const params = new URLSearchParams()
          for (const [key, value] of Object.entries(c.query ?? {})) {
            if (value !== undefined) params.set(key, value)
          }

          const { callbackURL, errorURL, newUserURL, requestSignUp } = await parseState(c)
          const state = params.get('state')!
          const resolvedErrorURL = errorURL ?? `${c.context.baseURL}/error`
          const expectedReturnTo = `${c.context.baseURL}/steam/callback?state=${encodeURIComponent(state)}`

          const steamId = await verifySteamOpenId(params, expectedReturnTo)
          if (!steamId) {
            throw c.redirect(`${resolvedErrorURL}?error=invalid_steam_response`)
          }

          const profile = await fetchSteamProfile(options.apiKey, steamId)
          const email = `${steamId}@steam.invalid`
          const userInfo = {
            id: steamId,
            name: profile?.personaname ?? `Steam_${steamId.slice(-6)}`,
            email,
            emailVerified: false,
            image: profile?.avatarfull,
          }

          const result = await handleOAuthUserInfo(c, {
            userInfo,
            account: {
              providerId,
              accountId: steamId,
            },
            callbackURL: callbackURL ?? '/',
            disableSignUp: !requestSignUp,
          })

          if (result.error || !result.data) {
            throw c.redirect(`${resolvedErrorURL}?error=${encodeURIComponent(result.error ?? 'steam_sign_in_failed')}`)
          }

          await setSessionCookie(c, result.data)

          const redirectTo = (result.isRegister ? newUserURL || callbackURL : callbackURL) ?? '/'
          throw c.redirect(String(redirectTo))
        },
      ),
    },
  }
}
