/* Asesoras nuevas en el campo "Asesora" de Pipedrive (personas).
   Se hace solo al abrir RURUSH Hoy (aquí vive el token de Pipedrive): si falta una opción, se agrega
   conservando TODAS las opciones existentes (Pipedrive borra las que no se mandan). Una vez listo,
   queda anotado en la propiedad PD_ASESORAS_OK y no se vuelve a llamar. */

const PD_ASESORAS_NUEVAS = ['CIELO'];

function pd_asesorasSiFalta_() {
  const p = PropertiesService.getScriptProperties(), firma = PD_ASESORAS_NUEVAS.join(',');
  if (p.getProperty('PD_ASESORAS_OK') === firma) return '';
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) return '';
  try {
    if (p.getProperty('PD_ASESORAS_OK') === firma) return '';
    // el campo se busca por su key (SM_PD.ASESORA) en personas
    let campo = null;
    for (let start = 0, v = 0; v < 6 && !campo; v++) {
      const j = pd('/personFields?limit=500&start=' + start);
      campo = (j.data || []).filter(function (f) { return f.key === SM_PD.ASESORA; })[0] || null;
      const pg = j.additional_data && j.additional_data.pagination;
      if (!pg || !pg.more_items_in_collection) break;
      start = pg.next_start;
    }
    if (!campo) throw new Error('no encontré el campo Asesora en Pipedrive.');
    const opts = (campo.options || []).map(function (o) { return { id: o.id, label: o.label }; });
    const tiene = function (n) { return opts.some(function (o) { return String(o.label || '').trim().toUpperCase() === n; }); };
    const faltan = PD_ASESORAS_NUEVAS.filter(function (n) { return !tiene(n); });
    if (faltan.length) {
      const r = UrlFetchApp.fetch(PIPEDRIVE_BASE + '/personFields/' + campo.id, {
        method: 'put', contentType: 'application/json', muteHttpExceptions: true,
        headers: { 'x-api-token': token('PIPEDRIVE_TOKEN') },
        payload: JSON.stringify({ options: opts.concat(faltan.map(function (n) { return { label: n }; })) })
      });
      const j = JSON.parse(r.getContentText() || '{}');
      if (r.getResponseCode() !== 200 || !j.success) throw new Error('Pipedrive respondió ' + r.getResponseCode() + ' ' + (j.error || ''));
      // comprobar que no se perdió ninguna opción
      const nuevas = (j.data && j.data.options) || [];
      const perdidas = opts.filter(function (o) { return !nuevas.some(function (x) { return x.id === o.id; }); });
      if (perdidas.length) throw new Error('se perdieron opciones: ' + perdidas.map(function (o) { return o.label; }).join(', '));
      Logger.log('Pipedrive · Asesora: agregué ' + faltan.join(', '));
    }
    p.setProperty('PD_ASESORAS_OK', firma);
    CacheService.getScriptCache().remove('pd_campos_ads');
    return '';
  } catch (e) {
    return 'Pipedrive (agregar asesora ' + firma + '): ' + e.message;
  } finally { lock.releaseLock(); }
}
