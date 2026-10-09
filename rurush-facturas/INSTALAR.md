# 🧾 RURUSH Facturas — control de gastos (instalar una sola vez, ~15 min)

App para el celular del equipo, para los **gastos del día a día**: agua, limpieza,
hojas/útiles, arreglo de máquinas, movilidad, etc. **Se toma la foto del comprobante,
se llena lo importante y la app calcula el resto y lo sube sola a OneDrive.**

| Se llena | La app calcula sola |
|---|---|
| Quién registra (se recuerda en su celular) | Mes y semana del año |
| 📷 Foto del comprobante, o de la galería si llegó por WhatsApp (y si quiere, otra del voucher) | Precio unitario (total ÷ cantidad) |
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
solo cuando vuelve la señal (o al abrir la app). La app abre aunque no haya señal
(después de haberla abierto una vez con internet). Las fotos se comprimen (~300 KB).

Cada gasto tiene un **ID** (columna A). Si alguna vez se corta la señal justo al subir,
puede quedar una fila repetida con el mismo ID: borra una.

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
2. **Source:** *Deploy from a branch* → la rama que tenga la carpeta `rurush-facturas`
   (hoy: `claude/vigilant-babbage-ee8ikf`, o la principal cuando la unas) → carpeta **/ (root)** → **Save**.
3. En 1–2 min queda en: **https://omarfrzbussines.github.io/omar/rurush-facturas/**

Si la publicas en otra dirección, esa misma dirección exacta debe estar en el paso 1.4
(Azure → tu app → **Autenticación** → agregar URI).

## 3. Elegir dónde se guardan las facturas

Para que **todo el equipo suba a TU OneDrive** hay dos formas:

> ⚠️ **Ábrela primero TÚ, en tu celular.** El primer celular que abre la app crea la carpeta
> y queda como **administrador** (es el que aprueba a los demás celulares).

**A) Una cuenta Microsoft del gym para todas (lo más simple).**
Todas entran a la app con esa misma cuenta. No hay que configurar nada más.
Aunque compartan la cuenta, solo tus celulares administran y cada celular nuevo necesita tu aprobación.

**B) Cada una con su cuenta + carpeta compartida.**
1. Tú abres la app con tu cuenta → se crea `RURUSH Facturas` en tu OneDrive.
2. En OneDrive web: clic derecho en la carpeta → **Compartir** → **invita a cada persona por su correo
   con permiso de edición** → **Copiar vínculo**.
   ⚠️ Evita "Cualquiera con el vínculo puede editar": quien reciba ese link (si se reenvía por WhatsApp)
   podría ver o borrar los comprobantes.
3. En la app: **⚙️ Ajustes → Carpeta de OneDrive** → pega ese vínculo → **Guardar**.
4. **🔗 Copiar link para el equipo** → mándales ese link por WhatsApp.
   Al abrirlo, su celular queda apuntando a tu carpeta.

## 4. En el celular de cada persona

1. Abre el link en **Chrome** (Android) o **Safari** (iPhone) → **Entrar con Microsoft**.
2. Agrégala a la pantalla de inicio:
   - **Android:** menú ⋮ → **Agregar a la pantalla principal**.
   - **iPhone:** compartir ⬆️ → **Agregar a inicio**.
3. La app sale **🔒 bloqueada** con un código (ej. `K7QM-3XPA`): escribe su nombre → **📨 Pedir acceso**.
4. Tú, en tu celular: **⚙️ Ajustes → 📱 Solicitudes de acceso** → revisa el nombre y el código
   (que coincida con el que ve en su pantalla) → **Aprobar**.
5. Ella toca **🔄 Ya me aprobaron** → entra. Toca su nombre en "¿Quién registra?" (queda recordado).

## 🔒 Seguridad: quién puede abrir la app

Hay **dos candados**:

1. **Microsoft / OneDrive (el fuerte):** sin una cuenta que tenga acceso a tu carpeta no se puede
   ver ni subir nada, aunque tengan el link de la app. Esto lo controla Microsoft.
2. **Celulares aprobados (en la app):** cada celular tiene su código. Uno nuevo queda bloqueado
   hasta que lo apruebes; uno que quites queda bloqueado la próxima vez que abra la app con internet.
   Desde un celular bloqueado tampoco se sube lo que haya quedado en cola.

En **⚙️ Ajustes → 📱 Celulares autorizados** ves cada celular (nombre, código, modelo, cuenta, fecha):
- **Quitar** → ese celular pierde el acceso.
- **★** → lo haces administrador (puede aprobar celulares y cambiar ajustes). Ten **2 celulares admin**
  (el tuyo y otro de confianza) por si pierdes el tuyo.
- Las asesoras no ven estas opciones: en sus Ajustes solo aparece su código.

**Para cortarle el acceso a alguien de verdad** (por ejemplo si deja de trabajar):
1. **Quitar** su celular en la app, **y**
2. en OneDrive: quítala de la carpeta compartida (opción B), o **cambia la contraseña** de la cuenta
   del gym (opción A) y vuelve a entrar en los celulares que sigan.

Por qué el paso 2: el candado de celulares vive en `config.json`, dentro de la misma carpeta. Alguien
con conocimientos técnicos y acceso de edición a la carpeta podría saltárselo editando ese archivo.
Contra eso solo sirve el candado de Microsoft.

**Si un celular borra los datos del navegador** (o se reinstala Chrome), cambia su código y hay que
aprobarlo otra vez (lo de "en cola" no enviado se pierde). Quita el código viejo.

**Si pierdes tu celular admin y no tienes otro:** en OneDrive web abre la carpeta, borra `config.json`
y abre la app primero en tu celular nuevo: queda de administrador (las categorías vuelven a las de
fábrica y hay que aprobar de nuevo a todos los celulares).

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
| 🔒 "Este celular no está autorizado" | Pide acceso y que el administrador lo apruebe (ver paso 4) |
| "La carpeta todavía no tiene administrador" | La abrió alguien antes que tú con el link compartido: ábrela tú primero en tu celular |
| ⚠️ N sin subir | Toca **Reintentar**. Lo que está en cola no se borra hasta subirse |

No cambies, agregues ni borres columnas de la tabla del Excel (la app escribe 22 columnas fijas). Para resúmenes o tablas dinámicas usa hojas aparte.
