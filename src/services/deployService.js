import { getPortalToken } from '../auth/portalAuth'

export async function aggiornaGestionaleProduction() {
  const token = getPortalToken()

  if (!token) {
    throw new Error('Sessione Portal non disponibile.')
  }

  const response = await fetch('/api/deploy/gestionale-production.php', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })

  let data = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  if (!response.ok || data?.success === false) {
    throw new Error(data?.error || 'Non è stato possibile aggiornare il Gestionale in produzione.')
  }

  return data
}
