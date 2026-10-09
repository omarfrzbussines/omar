# 🧾 RURUSH Facturas — control de gastos (instalar una sola vez, ~15 min)

App para el celular del equipo, para los **gastos del día a día**: agua, limpieza,
hojas/útiles, arreglo de máquinas, movilidad, etc. **Se toma la foto del comprobante,
se llena lo importante y la app calcula el resto y lo sube sola a OneDrive.**

| Se llena | La app calcula sola |
|---|---|
| Quién registra (se recuerda en su celular) | Mes y semana del año |
| 📷 Foto del comprobante (y si quiere, otra del voucher) | Precio unitario (total ÷ cantidad) |
| Categoría (toque): Agua, Limpieza, Útiles, Mantenimiento… | Base imponible e IGV (solo si es **Factura**) |
| Qué se compró, total pagado, cantidad | RUC del proveedor (si ya se usó antes en ese celular) |
| Pagado con (toque): Caja chica, Yape, Plin… | Nombre del archivo y carpeta del mes |
| Comprobante, proveedor, RUC, Nº (opcional) | Avisos: factura sin RUC, RUC mal escrito, fecha futura |

En OneDrive queda así:

```
RURUSH Facturas/
├── Control de gastos.xlsx        ← una fila por gasto (tabla "Gastos", con link "Ver" a la foto)
├── config.json                   ← categorías, personas, comprobantes (se edita desde ⚙️ Ajustes)
├── 2026-10 OCTUBRE/
│   ├── 2026-10-09 - AGUA - San Luis Distribuidora - S59 - LAURA.jpg
│   ├── 2026-10-09 - MANTENIMIENTO DE MÁQUINAS - Cambio de cable polea - S120 - OMAR.jpg
│   └── …
└── 2026-11 NOVIEMBRE/
```

En el Excel puedes filtrar o hacer una tabla dinámica por **Categoría**, **Mes**,
**Semana**, **Pagado con** o **Registrado por** (en una hoja aparte).

**Sin internet no se pierde nada:** el gasto queda guardado en el celular y se sube
solo cuando vuelve la señal (o al abrir la app). Las fotos se comprimen (~300 KB).

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

Para que **todo el equipo suba a TU OneDrive** hay dos formas:

**A) Una cuenta Microsoft del gym para todas (lo más simple).**
Todas entran a la app con esa misma cuenta. No hay que configurar nada más.

**B) Cada una con su cuenta + carpeta compartida.**
1. Tú abres la app con tu cuenta → se crea `RURUSH Facturas` en tu OneDrive.
2. En OneDrive web: clic derecho en la carpeta → **Compartir** → **"Cualquiera con el vínculo puede editar"**
   (o invita a cada persona con permiso de edición) → **Copiar vínculo**.
3. En la app: **⚙️ Ajustes → Carpeta de OneDrive** → pega ese vínculo → **Guardar**.
4. **🔗 Copiar link para el equipo** → mándales ese link por WhatsApp.
   Al abrirlo, su celular queda apuntando a tu carpeta.

## 4. En el celular de cada persona

1. Abre el link en **Chrome** (Android) o **Safari** (iPhone) → **Entrar con Microsoft**.
2. Agrégala a la pantalla de inicio:
   - **Android:** menú ⋮ → **Agregar a la pantalla principal**.
   - **iPhone:** compartir ⬆️ → **Agregar a inicio**.
3. Toca su nombre en "¿Quién registra?" (queda recordado).

## 5. Ajustes

**⚙️ Ajustes** — se guarda en `config.json` y vale para todo el equipo:

- **Categorías:** agrega o quita las que uses (ej. "Suplementos", "Publicidad").
- **Quién registra**, **Pagado con**.
- **Comprobantes:** pon `| igv` al lado del que trae IGV desglosado (por defecto solo `Factura | igv`).
- **IGV:** 18% por defecto.

## Si algo falla

| Mensaje | Qué hacer |
|---|---|
| Falta pegar el CLIENT_ID | Paso 1.7 |
| Error de Microsoft "redirect_uri … does not match" | La dirección del navegador debe ser igual a la del paso 1.4 (ojo con la `/` final y con `index.html`) |
| "OneDrive respondió 403" | Esa persona no tiene permiso de **edición** en la carpeta compartida |
| "El Excel está bloqueado" | Alguien tiene el Excel abierto en Excel de escritorio. Se reintenta solo; mejor abrirlo en Excel web |
| "No encuentro la tabla Gastos" | Renombraron o borraron la tabla. Borra el Excel y el próximo gasto lo crea de nuevo |
| ⚠️ N sin subir | Toca **Reintentar**. Lo que está en cola no se borra hasta subirse |

No cambies, agregues ni borres columnas de la tabla del Excel (la app escribe 22 columnas fijas). Para resúmenes o tablas dinámicas usa hojas aparte.
