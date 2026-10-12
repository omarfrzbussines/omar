/* Ejecutar UNA vez (configurarUnaVez) y después borrar este archivo: el token queda guardado en Google. */

function configurarUnaVez() {
  const META_TOKEN = 'PEGA-AQUÍ-EL-TOKEN-DE-META';
  const CARPETA = 'PEGA-AQUÍ-EL-LINK-DE-LA-CARPETA-DE-DRIVE';

  const p = PropertiesService.getScriptProperties();
  p.setProperty('META_TOKEN', META_TOKEN.trim());
  const id = (CARPETA.match(/[-\w]{25,}/) || [])[0];
  if (!id) throw new Error('No reconozco el link de la carpeta de Drive.');
  p.setProperty('CARPETA_ID', id);
  DriveApp.getFolderById(id).getName();   // confirma que existe y tienes acceso

  const ig = buscarCuentaIG_();
  p.setProperty('IG_USER_ID', ig.id);
  hoja_();
  activarReloj();
  Logger.log('✅ Listo: @' + ig.username + ' · carpeta "' + DriveApp.getFolderById(id).getName() + '" · reloj cada 10 min.');
}
