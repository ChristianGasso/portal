import { getPortalToken } from '../auth/portalAuth'

async function portalRequest(path) {
  const token = getPortalToken()

  if (!token) {
    throw new Error('Sessione Portal non disponibile.')
  }

  const response = await fetch(path, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  let data = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  if (!response.ok || data?.success === false) {
    throw new Error(data?.error || 'Operazione non riuscita.')
  }

  return data
}

export async function caricaAvis() {
  const data = await portalRequest('/api/avis/lista.php')
  return Array.isArray(data?.avis) ? data.avis : []
}

export async function caricaDettaglioAvis(idAvis) {
  const id = Number(idAvis)
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('AVIS non valida.')
  }

  return portalRequest(`/api/avis/dettaglio.php?id=${encodeURIComponent(id)}`)
}
