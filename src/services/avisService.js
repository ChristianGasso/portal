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


export async function gestisciLogoAvis(idAvis, action, logoBase64 = null) {
  const payload = {
    id_avis: Number(idAvis),
    action,
  }

  if (logoBase64) {
    payload.logo_base64 = logoBase64
  }

  return portalRequest('/api/avis/logo.php', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}


export async function caricaQuestionarioAvis(idAvis) {
  const id = Number(idAvis)
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('AVIS non valida.')
  }

  return portalRequest(`/api/avis/questionario/lista.php?id_avis=${encodeURIComponent(id)}`)
}

export async function aggiornaDomandaQuestionarioAvis(idAvis, domanda) {
  return portalRequest('/api/avis/questionario/aggiorna.php', {
    method: 'POST',
    body: JSON.stringify({
      id_avis: Number(idAvis),
      id_domanda: Number(domanda.id),
      testo: domanda.testo,
      pagina_compilazione: Number(domanda.pagina_compilazione),
      tipo_risposta: domanda.tipo_risposta,
      obbligatoria: Boolean(domanda.obbligatoria),
      solo_donne: Boolean(domanda.solo_donne),
      dettaglio_quando: domanda.dettaglio_quando || null,
      etichetta_dettaglio: domanda.etichetta_dettaglio || null,
      ordine_domanda: Number(domanda.ordine_domanda),
      attiva: Boolean(domanda.attiva),
    }),
  })
}


export async function gestisciPdfQuestionarioAvis(idAvis, action, pdfBase64 = null) {
  const payload = {
    id_avis: Number(idAvis),
    action,
  }

  if (pdfBase64) {
    payload.pdf_base64 = pdfBase64
  }

  return portalRequest('/api/avis/questionario/pdf.php', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}


export async function caricaPdfSorgenteQuestionarioAvis(idAvis) {
  const token = getPortalToken()

  if (!token) {
    throw new Error('Sessione Portal non disponibile.')
  }

  const response = await fetch('/api/avis/questionario/pagina.php', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id_avis: Number(idAvis),
      action: 'source',
    }),
  })

  if (!response.ok) {
    let message = 'Non è stato possibile caricare il PDF del questionario.'
    try {
      const data = await response.json()
      if (data?.error) message = data.error
    } catch {
      // Mantiene il messaggio generico se la risposta non è JSON.
    }
    throw new Error(message)
  }

  const blob = await response.blob()
  if (!blob || blob.size === 0) {
    throw new Error('Il PDF del questionario risulta vuoto.')
  }

  return blob
}

export async function caricaLayoutQuestionarioAvis(idAvis) {
  const id = Number(idAvis)
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('AVIS non valida.')
  }

  return portalRequest(`/api/avis/questionario/layout.php?id_avis=${encodeURIComponent(id)}`)
}

export async function salvaLayoutQuestionarioAvis(idAvis, campi) {
  return portalRequest('/api/avis/questionario/layout.php', {
    method: 'POST',
    body: JSON.stringify({
      id_avis: Number(idAvis),
      campi,
      pagina_anteprima: Number.isInteger(Number(paginaAnteprima)) && Number(paginaAnteprima) > 0
        ? Number(paginaAnteprima)
        : null,
    }),
  })
}


export async function scaricaAnteprimaQuestionarioAvis(idAvis, campi, paginaAnteprima = null) {
  const token = getPortalToken()

  if (!token) {
    throw new Error('Sessione Portal non disponibile.')
  }

  const response = await fetch('/api/avis/questionario/anteprima.php', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id_avis: Number(idAvis),
      campi,
    }),
  })

  if (!response.ok) {
    let message = 'Non è stato possibile generare il PDF di prova.'
    try {
      const data = await response.json()
      if (data?.error) message = data.error
    } catch {
      // Mantiene il messaggio generico se la risposta non è JSON.
    }
    throw new Error(message)
  }

  const blob = await response.blob()
  if (!blob || blob.size === 0) {
    throw new Error('Il PDF di prova risulta vuoto.')
  }

  return {
    success: true,
    url: URL.createObjectURL(blob),
  }
}

export async function importaQuestionarioAvis(idAvis, query) {
  return portalRequest('/api/avis/questionario/importa.php', {
    method: 'POST',
    body: JSON.stringify({
      id_avis: Number(idAvis),
      query,
    }),
  })
}

export async function resetQuestionarioAvis(idAvis) {
  return portalRequest('/api/avis/questionario/reset.php', {
    method: 'POST',
    body: JSON.stringify({
      id_avis: Number(idAvis),
      conferma: 'RESET DOMANDE',
    }),
  })
}
