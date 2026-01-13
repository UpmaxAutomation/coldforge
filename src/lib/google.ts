import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
]

export function getGoogleOAuthClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured')
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

export function getGoogleAuthUrl(state: string): string {
  const oauth2Client = getGoogleOAuthClient()

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state,
    prompt: 'consent', // Force consent to get refresh token
  })
}

export async function getGoogleTokens(code: string) {
  const oauth2Client = getGoogleOAuthClient()
  const { tokens } = await oauth2Client.getToken(code)
  return tokens
}

export async function refreshGoogleToken(refreshToken: string) {
  const oauth2Client = getGoogleOAuthClient()
  oauth2Client.setCredentials({ refresh_token: refreshToken })

  const { credentials } = await oauth2Client.refreshAccessToken()
  return credentials
}

export async function getGoogleUserInfo(accessToken: string) {
  const oauth2Client = getGoogleOAuthClient()
  oauth2Client.setCredentials({ access_token: accessToken })

  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
  const { data } = await oauth2.userinfo.get()

  return {
    email: data.email!,
    name: data.name || data.email!,
  }
}

export async function sendGmailMessage(
  accessToken: string,
  refreshToken: string,
  to: string,
  subject: string,
  body: string,
  from?: string
) {
  const oauth2Client = getGoogleOAuthClient()
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

  // Create email in RFC 2822 format
  const email = [
    from ? `From: ${from}` : '',
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    body,
  ].filter(Boolean).join('\r\n')

  const encodedMessage = Buffer.from(email)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedMessage,
    },
  })

  return response.data
}

export async function getGmailMessages(
  accessToken: string,
  refreshToken: string,
  maxResults = 10,
  query?: string
) {
  const oauth2Client = getGoogleOAuthClient()
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

  const response = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    q: query,
  })

  if (!response.data.messages) {
    return []
  }

  // Fetch full message details
  const messages = await Promise.all(
    response.data.messages.map(async (msg) => {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'full',
      })
      return detail.data
    })
  )

  return messages
}

export async function testGoogleConnection(accessToken: string, refreshToken: string): Promise<{
  success: boolean
  email?: string
  error?: string
}> {
  try {
    const oauth2Client = getGoogleOAuthClient()
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
    const profile = await gmail.users.getProfile({ userId: 'me' })

    return {
      success: true,
      email: profile.data.emailAddress!,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
