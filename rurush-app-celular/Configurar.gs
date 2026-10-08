/* PASO ÚNICO: pega tus dos tokens entre las comillas, guarda (💾) y ejecuta
   configurarUnaVez (selector de funciones arriba → Ejecutar).
   Quedan guardados en las Propiedades del script. Después BORRA este archivo. */
function configurarUnaVez() {
  const APPSFIT_TOKEN = 'PEGA-AQUÍ-EL-TOKENEMPRESA-DE-APPS-FIT';
  const PIPEDRIVE_TOKEN = 'PEGA-AQUÍ-EL-TOKEN-DE-PIPEDRIVE';
  if (/PEGA-AQU/.test(APPSFIT_TOKEN + PIPEDRIVE_TOKEN)) throw new Error('Primero pega los dos tokens.');
  PropertiesService.getScriptProperties().setProperties({ APPSFIT_TOKEN: APPSFIT_TOKEN, PIPEDRIVE_TOKEN: PIPEDRIVE_TOKEN });
  return probarConexion();
}
