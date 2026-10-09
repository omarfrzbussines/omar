# 🧾 RURUSH Facturas — instalar (una sola vez, ~15 min)

App para el celular de las asesoras: **toman la foto de la factura/boleta, llenan
lo importante y la app calcula el resto y lo sube sola a OneDrive.**

| La asesora llena | La app calcula sola |
|---|---|
| 📷 Foto (y si quiere, otra del voucher) | Fecha y hora, mes |
| Asesora (se recuerda en su celular) | Precio de lista del plan |
| Cliente, DNI, celular | Descuento (S/ y %) |
| Plan (toque) | Base imponible e IGV |
| Monto cobrado (se llena con el precio del plan) | Fecha de vencimiento del plan |
| Método de pago (toque) | Nombre del archivo y carpeta del mes |
| Nº de comprobante, observación (opcional) | ID único de la venta |

En OneDrive queda así:

```
RURUSH Facturas/
├── Control de facturas.xlsx      ← una fila por venta (tabla "Ventas", con link "Ver" a la foto)
├── config.json                   ← planes, precios, asesoras (se edita desde ⚙️ Ajustes)
├── 2026-10 OCTUBRE/
│   ├── 2026-10-09 - 1621 - JUAN PEREZ - Trimestral - S350 - LAURA.jpg
│   └── …
└── 2026-11 NOVIEMBRE/
```

**Sin internet no se pierde nada:** la venta queda guardada en el celular y se sube
sola cuando vuelve la señal (o al abrir la app). Las fotos se comprimen (~300 KB).

---

## 1. Registrar la app en Microsoft (gratis, 5 min, una sola vez)

1. Entra a **https://portal.azure.com** con tu cuenta Microsoft (la del OneDrive) →
   busca **"Registros de aplicaciones"** (App registrations) → **＋ Nuevo registro**.
2. **Nombre:** `RURUSH Facturas`.
3. **Tipos de cuenta admitidos:** *Cuentas en cualquier directorio organizativo y cuentas personales de Microsoft*.
4. **URI de redirección:** elige **Aplicación de página única (SPA)** y pega:
   `https://omarfrzbussines.github.io/omar/rurush-facturas/`
   (con la `/` final; es la dirección del paso 2).
5. **Registrar.** Copia el **Id. de aplicación (cliente)** (algo como `1a2b3c4d-…`).
6. Menú **Permisos de API** → **＋ Agregar un permiso** → **Microsoft Graph** →
   **Permisos delegados** → marca **Files.ReadWrite.All** y **User.Read** → **Agregar permisos**.
7. Abre `rurush-facturas/index.html`, busca `PEGA-AQUI-EL-ID-DE-APLICACION` y
   reemplázalo por el Id. que copiaste. Guarda y súbelo al repo.

> El Id. de aplicación **no es secreto** (no da acceso a nada por sí solo), puede estar en el repo público.

## 2. Publicarla (GitHub Pages, gratis)

1. En GitHub: repo **omar** → **Settings → Pages**.
2. **Source:** *Deploy from a branch* → rama donde está esta carpeta → carpeta **/ (root)** → **Save**.
3. En 1–2 min queda en: **https://omarfrzbussines.github.io/omar/rurush-facturas/**

Si la publicas en otra dirección, esa misma dirección exacta debe estar en el paso 1.4
(Azure → tu app → **Autenticación** → agregar URI).

## 3. Elegir dónde se guardan las facturas

Para que **todas las asesoras suban a TU OneDrive** hay dos formas:

**A) Una cuenta Microsoft del gym para todas (lo más simple).**
Todas entran a la app con esa misma cuenta. No hay que configurar nada más.

**B) Cada una con su cuenta + carpeta compartida.**
1. Tú abres la app con tu cuenta → se crea `RURUSH Facturas` en tu OneDrive.
2. En OneDrive web: clic derecho en la carpeta → **Compartir** → **"Cualquiera con el vínculo puede editar"**
   (o invita a cada asesora con permiso de edición) → **Copiar vínculo**.
3. En la app: **⚙️ Ajustes → Carpeta de OneDrive** → pega ese vínculo → **Guardar**.
4. **🔗 Copiar link para las asesoras** → mándales ese link por WhatsApp.
   Al abrirlo, su celular queda apuntando a tu carpeta.

## 4. En el celular de cada asesora

1. Abre el link en **Chrome** (Android) o **Safari** (iPhone) → **Entrar con Microsoft**.
2. Agrégala a la pantalla de inicio:
   - **Android:** menú ⋮ → **Agregar a la pantalla principal**.
   - **iPhone:** compartir ⬆️ → **Agregar a inicio**.
3. Toca su nombre arriba (queda recordado).

## 5. Ajustes (planes y precios)

**⚙️ Ajustes** — se guarda en `config.json` y vale para todas:

- **Planes:** una línea por plan, `Nombre | precio | duración`
  (`1m` = 1 mes, `3m` = 3 meses, `15d` = 15 días). ⚠️ Los precios que vienen son de
  ejemplo: **ponle los reales la primera vez.**
- Asesoras, métodos de pago, tipos de venta.
- **IGV:** 18% incluido en el precio por defecto. Pon **0** si no se factura con IGV (Nuevo RUS).

## Si algo falla

| Mensaje | Qué hacer |
|---|---|
| Falta pegar el CLIENT_ID | Paso 1.7 |
| Error de Microsoft "redirect_uri … does not match" | La dirección del navegador debe ser igual a la del paso 1.4 (ojo con la `/` final y con `index.html`) |
| "OneDrive respondió 403" | La asesora no tiene permiso de **edición** en la carpeta compartida |
| "El Excel está bloqueado" | Alguien tiene el Excel abierto en Excel de escritorio. Se reintenta solo; mejor abrirlo en Excel web |
| "No encuentro la tabla Ventas" | Renombraron o borraron la tabla. Borra el Excel y la próxima venta lo crea de nuevo |
| ⚠️ N sin subir | Toca **Reintentar**. Lo que está en cola no se borra hasta subirse |

No cambies, agregues ni borres columnas de la tabla del Excel (la app escribe 23 columnas fijas). Para resúmenes o tablas dinámicas usa hojas aparte.
