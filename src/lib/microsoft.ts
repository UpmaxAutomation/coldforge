import { ConfidentialClientApplication, AuthorizationCodeRequest, RefreshTokenRequest } from '@azure/msal-node'

const SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'Mail.Send',
  'Mail.Read',
  'Mail.ReadWrite',
  'User.Read',
]

function getMsalConfig() {
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
  const tenantId = process.env.MICROSOFT_TENANT_ID || 'common'

  if (!clientId || !clientSecret) {
    throw new Error('Microsoft OAuth credentials not configured')
  }

  return {
    auth: {
      clientId,
      clientSecret,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
  }
}

function getMsalClient(): ConfidentialClientApplication {
  return new ConfidentialClientApplication(getMsalConfig())
}

export function getMicrosoftAuthUrl(state: string): string {
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/microsoft/callback`
  const tenantId = process.env.MICROSOFT_TENANT_ID || 'common'

  if (!clientId) {
    throw new Error('Microsoft OAuth credentials not configured')
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: SCOPES.join(' '),
    state,
    prompt: 'consent',
  })

  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`
}

export async function getMicrosoftTokens(code: string) {
  const msalClient = getMsalClient()
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/microsoft/callback`

  const tokenRequest: AuthorizationCodeRequest = {
    code,
    scopes: SCOPES,
    redirectUri,
  }

  const response = await msalClient.acquireTokenByCode(tokenRequest)

  return {
    accessToken: response.accessToken,
    refreshToken: (response as unknown as { refreshToken?: string }).refreshToken,
    expiresOn: response.expiresOn,
    account: response.account,
  }
}

export async function refreshMicrosoftToken(refreshToken: string) {
  const msalClient = getMsalClient()

  const refreshRequest: RefreshTokenRequest = {
    refreshToken,
    scopes: SCOPES,
  }

  const response = await msalClient.acquireTokenByRefreshToken(refreshRequest)

  return {
    accessToken: response?.accessToken,
    refreshToken: (response as unknown as { refreshToken?: string })?.refreshToken || refreshToken,
    expiresOn: response?.expiresOn,
  }
}

export async function getMicrosoftUserInfo(accessToken: string) {
  const response = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error('Failed to get user info from Microsoft')
  }

  const data = await response.json()

  return {
    email: data.mail || data.userPrincipalName,
    name: data.displayName || data.mail || data.userPrincipalName,
  }
}

export async function sendMicrosoftEmail(
  accessToken: string,
  to: string,
  subject: string,
  body: string
) {
  const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject,
        body: {
          contentType: 'HTML',
          content: body,
        },
        toRecipients: [
          {
            emailAddress: {
              address: to,
            },
          },
        ],
      },
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to send email: ${error}`)
  }

  return { success: true }
}

export async function getMicrosoftMessages(
  accessToken: string,
  maxResults = 10,
  filter?: string
) {
  const params = new URLSearchParams({
    $top: maxResults.toString(),
    $orderby: 'receivedDateTime desc',
  })

  if (filter) {
    params.append('$filter', filter)
  }

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  if (!response.ok) {
    throw new Error('Failed to get messages from Microsoft')
  }

  const data = await response.json()
  return data.value
}

export async function testMicrosoftConnection(accessToken: string): Promise<{
  success: boolean
  email?: string
  error?: string
}> {
  try {
    const userInfo = await getMicrosoftUserInfo(accessToken)
    return {
      success: true,
      email: userInfo.email,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
