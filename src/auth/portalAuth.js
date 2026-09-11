const TOKEN_KEY = 'portal_access_token'

export function getPortalToken() {
  return window.localStorage.getItem(TOKEN_KEY)
}

export function setPortalToken(token) {
  if (!token) {
    window.localStorage.removeItem(TOKEN_KEY)
    return
  }

  window.localStorage.setItem(TOKEN_KEY, token)
}

export function clearPortalToken() {
  window.localStorage.removeItem(TOKEN_KEY)
}

async function parseResponse(response) {
  let data = null

  try {
    data = await response.json()
  } catch {
    data = null
  }

  if (!response.ok) {
    throw new Error(data?.error || 'Operazione non riuscita.')
  }

  return data
}

export async function loginPortal(email, password) {
  const response = await fetch('/api/auth/login.php', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  const data = await parseResponse(response)

  if (!data?.access_token) {
    throw new Error('Token di accesso non ricevuto.')
  }

  setPortalToken(data.access_token)

  return data
}

export async function getPortalSession() {
  const token = getPortalToken()

  if (!token) {
    return null
  }

  const response = await fetch('/api/auth/me.php', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (response.status === 401 || response.status === 403) {
    clearPortalToken()
    return null
  }

  const data = await parseResponse(response)

  return data?.user ?? null
}

export async function logoutPortal() {
  const token = getPortalToken()

  if (token) {
    try {
      await fetch('/api/auth/logout.php', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
    } catch {
      // Il token è locale e viene comunque rimosso.
    }
  }

  clearPortalToken()
}
