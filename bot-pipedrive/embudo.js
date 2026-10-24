// Embudo "EMBUDO RURUSH 2026" (Pipedrive, embudo 14): mueve los tratos solos con lo que las asesoras marcan en la app
// RURUSH · Free Pass de hoy (que guarda en Pipedrive). Sin IA. Pocas llamadas: solo cambios (/recents) cada 30 min,
// una revisión diaria de los FP de ayer sin marcar, y 1–2 llamadas por trato que se mueve.
//   FP creado (pendiente)  → CLASE AGENDADA      FP marcado hecho (Asistió) → VINO A CLASE
//   FP de ayer sin marcar  → NO VINO (reagendar) CIERRE = SEGUIMIENTO → EN DECISIÓN
//   CIERRE = SI → GANADO (EMPEZÓ PLAN)           CIERRE = NO → PERDIDO ("No se inscribió")
// Nunca se mueve hacia atrás (salvo NO VINO → CLASE AGENDADA si lo reagendan) ni se toca un trato ganado o perdido.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const EMBUDO = 14
const E = { nuevo: 71, contactado: 72, agendada: 73, noVino: 89, vino: 74, decision: 75, plan: 76 }
const ORDEN = { 71: 1, 72: 2, 73: 3, 89: 4, 74: 5, 75: 6, 76: 7 }
const CIERRE = { campo: '33b8be2e235bd672060ee054b04372be13b53f52', SI: 136, NO: 137, SEGUIMIENTO: 149 }

const ARCHIVO = join(process.cwd(), 'embudo.json') // { desde, ultimoNoVino, tratos: {personaId: dealId} }
let estado = { desde: null, ultimoNoVino: '', tratos: {} }
try { estado = { ...estado, ...JSON.parse(readFileSync(ARCHIVO, 'utf8')) } } catch {}
const guardar = () => { try { writeFileSync(ARCHIVO, JSON.stringify(estado)) } catch {} }

let llamadas = 0
const api = async (metodo, ruta, cuerpo) => {
  llamadas++
  const url = `https://${process.env.PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1${ruta}${ruta.includes('?') ? '&' : '?'}api_token=${process.env.PIPEDRIVE_API_TOKEN}`
  const r = await fetch(url, { method: metodo, headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined, body: cuerpo ? JSON.stringify(cuerpo) : undefined, signal: AbortSignal.timeout(30000) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.success === false) throw new Error(`Pipedrive ${metodo} ${ruta.split('?')[0]} → ${r.status} ${j.error ?? ''}`)
  return j
}
const limaHoy = (dias = 0) => new Date(Date.now() - 5 * 36e5 + dias * 864e5).toISOString().slice(0, 10)
// due_date/due_time de Pipedrive vienen en UTC: fecha de la clase en hora Lima (una clase de 7 pm Lima ya es "mañana" en UTC)
const fechaLima = (a) => !a?.due_date ? '' : !a.due_time ? a.due_date
  : new Date(Date.parse(`${a.due_date}T${a.due_time.slice(0, 5)}:00Z`) - 5 * 36e5).toISOString().slice(0, 10)
const esFP = (a) => /^FP\b/i.test(a?.subject ?? '')

// Trato abierto de la persona en el embudo (lo crea si no tiene)
const tratoDe = async (personaId, nombre) => {
  if (estado.tratos[personaId]) {
    const d = (await api('GET', `/deals/${estado.tratos[personaId]}`)).data
    if (d && d.pipeline_id === EMBUDO && !d.deleted) return d
  }
  const lista = (await api('GET', `/persons/${personaId}/deals?status=all_not_deleted&limit=100`)).data ?? []
  const delEmbudo = lista.filter((d) => d.pipeline_id === EMBUDO).sort((a, b) => (a.status === 'open' ? -1 : 1) - (b.status === 'open' ? -1 : 1) || b.add_time.localeCompare(a.add_time))
  let d = delEmbudo[0]
  if (!d) d = (await api('POST', '/deals', { title: nombre || `Persona ${personaId}`, person_id: personaId, pipeline_id: EMBUDO, stage_id: E.nuevo })).data
  estado.tratos[personaId] = d.id
  return d
}

const mover = async (personaId, nombre, destino, motivo, log) => {
  const d = await tratoDe(personaId, nombre)
  if (d.status !== 'open') return // ganado o perdido: no se toca
  if (destino === 'ganado') {
    await api('PUT', `/deals/${d.id}`, { stage_id: E.plan, status: 'won' })
    return log.push(`${d.title} → GANADO (${motivo})`)
  }
  if (destino === 'perdido') {
    await api('PUT', `/deals/${d.id}`, { status: 'lost', lost_reason: 'No se inscribió' })
    return log.push(`${d.title} → PERDIDO (${motivo})`)
  }
  const actual = ORDEN[d.stage_id] ?? 0
  const reagendado = destino === E.agendada && d.stage_id === E.noVino
  if (ORDEN[destino] <= actual && !reagendado) return // nunca hacia atrás
  await api('PUT', `/deals/${d.id}`, { stage_id: destino })
  log.push(`${d.title} → ${Object.keys(E).find((k) => E[k] === destino)} (${motivo})`)
}

const porActividad = async (a, log) => {
  if (!esFP(a) || !a.person_id || a.active_flag === false) return
  if (a.done) return mover(a.person_id, a.person_name, E.vino, 'FP marcado: asistió', log)
  if (a.due_date >= limaHoy()) return mover(a.person_id, a.person_name, E.agendada, 'FP agendado', log)
}
const porPersona = async (p, log) => {
  const c = Number(p?.[CIERRE.campo])
  if (c === CIERRE.SI) return mover(p.id, p.name, 'ganado', 'CIERRE = SI (inscrito)', log)
  if (c === CIERRE.SEGUIMIENTO) return mover(p.id, p.name, E.decision, 'CIERRE = SEGUIMIENTO', log)
  if (c === CIERRE.NO) return mover(p.id, p.name, 'perdido', 'CIERRE = NO', log)
}

/** Corre cada 30 min. Devuelve { movidos, llamadas, log }. */
export const actualizarEmbudo = async () => {
  if (!process.env.PIPEDRIVE_API_TOKEN) return { movidos: 0, llamadas: 0, log: [] }
  llamadas = 0
  const log = []
  const inicio = new Date().toISOString().slice(0, 19).replace('T', ' ')
  if (!estado.desde) {
    // Primera vez: los FP de los últimos 14 días (los que ya marcaron en la app)
    let acts = []
    for (let s = 0; s < 5000; s += 500) {
      const r = await api('GET', `/activities?user_id=0&start_date=${limaHoy(-14)}&end_date=${limaHoy(30)}&limit=500&start=${s}`)
      acts = acts.concat(r.data ?? [])
      if (!r.additional_data?.pagination?.more_items_in_collection) break
    }
    for (const a of acts) {
      try {
        await porActividad(a, log)
        if (a.done && esFP(a)) await porPersona((await api('GET', `/persons/${a.person_id}`)).data, log)
      } catch (e) { log.push(`❌ ${a.person_name}: ${e.message}`) }
    }
  } else {
    // Después: solo actividades y personas que cambiaron desde la última vez
    // (paginado: con más de 500 cambios en 30 min antes se perdía el resto)
    for (let s = 0; s < 5000; s += 500) {
      const r = await api('GET', `/recents?since_timestamp=${encodeURIComponent(estado.desde)}&items=activity,person&limit=500&start=${s}`)
      for (const x of r.data ?? []) {
        try {
          if (x.item === 'activity') await porActividad(x.data, log)
          if (x.item === 'person') await porPersona(x.data, log)
        } catch (e) { log.push(`❌ ${x.data?.person_name ?? x.data?.name}: ${e.message}`) }
      }
      if (!r.additional_data?.pagination?.more_items_in_collection) break
    }
  }
  // Una vez al día (desde el mediodía): los FP de ayer que nadie marcó como hechos → NO VINO
  const h = new Date(Date.now() - 5 * 36e5).getUTCHours()
  if (h >= 12 && estado.ultimoNoVino !== limaHoy()) {
    // OJO: end_date de Pipedrive NO incluye ese día (start=end=ayer devolvía 0 actividades → nunca había NO VINO).
    // Se pide un rango hasta dentro de 30 días y se filtra por la fecha de la clase en hora Lima.
    // La primera vez con este arreglo se pone al día con los últimos 14 días; después, solo ayer.
    const ayer = limaHoy(-1), desde = estado.noVinoAlDia ? ayer : limaHoy(-14)
    let acts = []
    for (let s = 0; s < 10000; s += 500) {
      const r = await api('GET', `/activities?user_id=0&type=meeting&start_date=${desde}&end_date=${limaHoy(31)}&done=0&limit=500&start=${s}`)
      acts = acts.concat(r.data ?? [])
      if (!r.additional_data?.pagination?.more_items_in_collection) break
    }
    // quien ya tiene otro FP pendiente de hoy en adelante ya reagendó: no es NO VINO
    const reagendo = new Set(acts.filter((a) => esFP(a) && a.person_id && fechaLima(a) >= limaHoy()).map((a) => a.person_id))
    for (const a of acts) {
      if (!esFP(a) || !a.person_id || a.done || reagendo.has(a.person_id)) continue
      const f = fechaLima(a)
      if (f < desde || f > ayer) continue
      try { await mover(a.person_id, a.person_name, E.noVino, 'FP de ayer sin marcar', log) } catch (e) { log.push(`❌ ${a.person_name}: ${e.message}`) }
    }
    estado.ultimoNoVino = limaHoy()
    estado.noVinoAlDia = true
  }
  estado.desde = inicio
  guardar()
  return { movidos: log.filter((l) => !l.startsWith('❌')).length, llamadas, log }
}
