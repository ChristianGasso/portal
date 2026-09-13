import { getPortalToken } from '../auth/portalAuth'

async function portalRequest(path, options = {}) {
  const token = getPortalToken()

  if (!token) {
    throw new Error('Sessione Portal non disponibile.')
  }

  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
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


export async function aggiornaGeneraleAvis(idAvis, payload) {
  return portalRequest('/api/avis/aggiorna-generale.php', {
    method: 'POST',
    body: JSON.stringify({ id_avis: Number(idAvis), ...payload }),
  })
}

export async function aggiornaServiziAvis(idAvis, payload) {
  return portalRequest('/api/avis/aggiorna-servizi.php', {
    method: 'POST',
    body: JSON.stringify({ id_avis: Number(idAvis), ...payload }),
  })
}

export async function aggiornaLimitiAvis(idAvis, limiti) {
  return portalRequest('/api/avis/aggiorna-limiti.php', {
    method: 'POST',
    body: JSON.stringify({ id_avis: Number(idAvis), limiti }),
  })
}
