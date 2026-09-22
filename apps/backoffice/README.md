# apps/backoffice — nuevo frontend Angular del backoffice

Rehecho de cero (Angular 21, standalone components, sin NgModules) sobre el
backoffice v1 (`ag2backofficewebapp`, Angular 16 + PrimeNG, tema
`lara-light-purple`) que vive en un repo aparte
(`Code/Front/ag2backofficewebapp`, fuera de este monorepo). Antes de escribir
una línea se revisó esa app vieja para entender qué había: estructura de
módulos por dominio (`dictionary`, `product`, `rate`, `quote`, `contract`,
`commercial`, `setup`, `system`, `claim`, `process-flow`), un componente
`ag2-table` genérico (tabla + alta/edición/activar/inactivar ligado a la
máquina de estados `IdeState`/`SState`) reutilizado en casi todas las
pantallas, y un menú lateral armado en tiempo real contra `FGetSiteMap`
(hoy `GET /reference-data/site-map-menu`).

**Decisión explícita del usuario**: identidad visual nueva de cero (no se
mantiene el violeta `#6A63B8` ni el tema PrimeNG viejo), pero conservando
`PrimeNG` como librería de componentes complejos (tablas, diálogos,
dropdowns) para no reinventarlos, con el tema nuevo basado en tokens
("Aura"), más Tailwind CSS 4 para el layout general. Ver
`docs/02-roadmap.md` para el detalle completo de la decisión (incluida la
alternativa descartada: Tailwind puro sin librería de componentes).

## Por qué Angular 21 y no Angular 22 (versión pinneada a propósito)

Primera pasada de esta app: se armó sobre Angular 22 + PrimeNG 22 (las
versiones más nuevas en ese momento). Al probarlo en pantalla apareció un
cartel real: **"Invalid PrimeUI License"**. Investigado a fondo (incluida
la página oficial de PrimeTek, `primeui.dev/nextchapter`): a partir de
**PrimeNG 22, la librería dejó de ser MIT** y pasó a requerir una licencia
paga o una "Community license" gratuita pero que hay que tramitar (con
límites de facturación/tamaño de equipo, renovación anual, y sin ella
aparece ese cartel en cada pantalla). **PrimeNG 21 y anteriores quedan MIT
para siempre** -- declarado explícitamente así por PrimeTek, no es una
versión vieja de paso, es la última permanentemente libre.

Decisión: bajar toda la app a **Angular 21 + PrimeNG 21** (ambas muy
recientes igual, solo un major por detrás) para no depender de una
licencia de un tercero -- evita el cartel para siempre, sin trámites ni
riesgo de que cambien las condiciones. Bonus: Angular 21 pide Node
`22.12+` en vez de los `22.22.3+` que exigía Angular 22, así que con tu
Node actual anda directo, sin el paso extra de `nvm` que habíamos
agregado antes (ya sacado). El resto de las decisiones (Tailwind 4,
identidad visual nueva, la estructura de la app) no cambia en nada.

## Qué hay hoy (esqueleto, primera pasada)

- Login de dos pasos contra `iam-service` real (vía el `gateway`,
  `POST /iam/auth/login` → si el usuario tiene 2FA activo,
  `POST /iam/auth/2fa/verify`) -- ver `src/app/features/auth/login` y
  `src/app/core/auth/auth.service.ts`.
- Guard de ruta (`auth.guard.ts`) + interceptor HTTP (`auth.interceptor.ts`)
  que agrega el `Authorization: Bearer <token>` a cada request -- JWT
  guardado en `localStorage`, decodificado client-side (sin librería nueva,
  `core/auth/jwt.util.ts`) solo para leer claims (`code`, `role`) y
  armar la UI, nunca para validar la firma (eso lo hace el backend).
- Layout autenticado (`core/layout/shell.component.ts`): header con
  usuario/logout + sidebar dinámico que llama a
  `GET /reference-data/site-map-menu?codApplicationRole=<CodRol del JWT>`
  (real, mismo endpoint de `FGetSiteMap` ya implementado) y renderiza el
  árbol de hasta 3 niveles con un componente recursivo
  (`sidebar-nav-item.component.ts`).
- Dashboard placeholder (`features/dashboard`).
- **Catálogos comunes** (`features/catalogs`) -- CRUD real contra
  `CommonCatalogsModule` de `reference-data-service`: idiomas, géneros,
  estado civil, profesiones, actividad económica, tipos de identificación,
  parentescos, tipos de contacto y países (con su idioma por defecto como
  select). Un solo componente genérico (`CatalogsComponent`, configurado
  por `core/catalogs/catalog.model.ts::COMMON_CATALOG_REGISTRY`) reutilizado
  para los 9 -- alta, edición, activar/inactivar con confirmación, todo contra
  el `CatalogCrudService` real del backend. `SLocation` queda
  deliberadamente afuera (ver "Qué sigue" más abajo): es jerárquico y su
  unicidad es compuesta (`CodLocation`+`IdeCountry`), amerita una pantalla
  propia en vez de este componente de catálogo plano.
  **Cambio de contrato acompañante en el backend** (no pedido
  explícitamente, hecho porque era necesario para poder mostrar
  Activo/Inactivo real en la tabla): se agregó `include: { SState: true }`
  (y `SLanguage: true` para países) a los `CatalogCrudService` de
  `CommonCatalogsModule` -- antes esos catálogos devolvían `IdeState` como
  UUID crudo, sin forma de saber si era "ACTIVO" o no sin otra llamada.
  Es un agregado puramente aditivo al JSON de respuesta (mismo patrón que
  ya usaba `application-roles.service.ts` con `SApplication`), no rompe
  nada existente. Los códigos de estado usados son los mismos ya
  documentados en `iam-service` (`ACTIVO`/`INACTIVO`), no inventados acá.
- **Ubicaciones** (`features/locations`) -- pantalla propia para
  `SLocation` (no encaja en el componente genérico de Catálogos: unicidad
  compuesta `CodLocation`+`IdeCountry`, jerarquía propia vía
  `codLocationParent`). Navegación por breadcrumb: cada nivel pide solo
  sus hijos directos (`GET /locations?codLocationParent=<cod o ''>`),
  filtro que ya expone el backend -- no arma un árbol completo del lado
  del cliente. Filtro opcional por país, alta/edición/activar-inactivar.
  **Deliberadamente afuera todavía**: reasignar el país o mover una
  ubicación a otro padre (el backend sí soporta lo segundo vía
  `codLocationParent` en el update, pero armar un selector de "ubicación
  padre" con búsqueda entre potencialmente miles de filas es una pantalla
  aparte).
- **Configuración de menú** (`features/menu-config`) -- una sola pantalla
  con 4 pestañas (decisión explícita del usuario, ver `docs/02-roadmap.md`)
  para las 4 entidades de `SetupModule`, fuertemente relacionadas entre
  sí: **Aplicaciones** (`SApplication`, catálogo plano), **Roles de
  aplicación** (`SApplicationRole`, con la aplicación como FK obligatoria
  e inmutable después de creado -- mismo patrón que el país en
  Ubicaciones), **Ítems de menú** (`SSiteMap`, árbol vía
  `codSiteMapParent`, mostrado con `p-treeTable`) y **Permisos**
  (`SSiteMapRole`, matriz de checkboxes: se elige un rol y se otorga o
  revoca acceso a cada ítem con un toggle -- el backend no tiene
  `update` para esta tabla, solo `create` (nace en `ACTIVO`) y
  `PATCH /:id/state`, "se otorga o se retira, no se edita").
  **Resguardo de UI, no del backend**: el árbol de menú real
  (`FGetSiteMap`/`SiteMapMenuService`) recorre como máximo 3 niveles
  (confirmado leyendo el código: la recursión corta con `level < 3`); un
  ítem de nivel 4 se guardaría en la base pero jamás aparecería en ningún
  menú real. El backend no impone ese límite al crear/editar `SSiteMap`,
  así que la pantalla lo hace: solo ofrece como "padre" ítems de nivel 1
  o 2, para que ningún ítem nuevo caiga en un nivel muerto.
  **Cambio de contrato acompañante en el backend** (mismo patrón aditivo
  que en Catálogos comunes): se agregó `include: { SState: true }` a
  `applications.service.ts` y `site-map.service.ts` (antes sin include),
  y se extendió el de `application-roles.service.ts` de
  `{ SApplication: true }` a `{ SApplication: true, SState: true }`.

- **Configuración de productos** (`features/catalogs` reutilizado + dos
  pantallas nuevas, agrupadas bajo un ítem padre del sidebar) -- fase
  completa para poder armar un producto de punta a punta y, más adelante,
  cotizar. Decisión explícita del usuario (`AskUserQuestion`): construir
  todo el alcance de una (los 8 catálogos simples de tarifación + la
  jerarquía completa de producto + canal/vía de distribución + tablas de
  tarifa, no un subconjunto mínimo). Estructura de UI, en dos rondas: la
  primera puso Catálogos aparte + Productos maestro-detalle como tres
  ítems sueltos en el menú (descartando una mega-página de tabs o un
  wizard); al probarlo, el usuario notó que la pantalla de "Catálogos"
  había quedado desorganizada (23 catálogos mezclados, comunes y de
  producto) y pidió agruparlos -- **ítem padre "Configuración de
  productos" con 3 hijos en el sidebar** (usa el árbol de hasta 3 niveles
  que `SSiteMap`/`sidebar-nav-item.component.ts` ya soportaban desde
  "Configuración de menú", no hizo falta backend nuevo): "Catálogos de
  producto", "Productos" y "Tablas de tarifa". Ver `docs/02-roadmap.md`
  para el detalle de ambas rondas de decisiones.
  - **`CATALOG_REGISTRY` dividido en dos**: `COMMON_CATALOG_REGISTRY` (los
    9 catálogos comunes de siempre, pantalla "Catálogos" en la raíz del
    menú) y `PRODUCT_CATALOG_REGISTRY` (los 14 catálogos de producto,
    pantalla "Catálogos de producto" bajo "Configuración de productos")
    -- `risk-levels`, `risks`, `risk-types`, `currencies`,
    `insurance-areas`, `insurance-lines`, `deductible-types`,
    `limit-types` y `coverages` (`product-rating-service`);
    `channel-types`, `distribution-ways` y `distribution-channels`
    (`party-service`); `concept-types` y `concepts`
    (`reference-data-service`). Mismo componente genérico
    (`CatalogsComponent`) para ambas pantallas -- qué registro, título y
    subtítulo usar viene de `route.data` (`app.routes.ts`), leído en el
    constructor vía `ActivatedRoute` (no se sumó
    `withComponentInputBinding` solo para esto).
  - **Productos** (`features/products`, nueva) -- maestro-detalle real:
    se elige o crea un `SProduct` y, debajo, 5 subpestañas ligadas a ese
    producto (`input.required<CatalogRow>()`, primer uso de Angular
    signal inputs en esta app): Productos de riesgo (`SRiskProduct`),
    Planes (`SPlanProduct`), Plan × Riesgo (`SPlanProductRisk`),
    Coberturas del plan (`SCoveragePlan`, ~23 campos: deducible, límite,
    rangos de monto/tasa/prima, obligatoriedad, período de carencia) y
    Reglas de cálculo (`SCalculationRule`, editor de la fórmula
    `IF`/`THEN`/`ELSE` que consume el mismo `RulesEngineService`).
    Donde el backend no filtra la lista por producto se filtra del lado
    del cliente por la cadena de `include`; donde sí filtra (coberturas
    del plan por `idePlanProductRisk`, reglas por `ideCoveragePlan`) se
    usa ese filtro real.
  - **Tablas de tarifa** (`features/rate-tables`, nueva) -- `SRateTable`
    con dos secciones independientes por tabla: Factores (`SRateFactor`,
    máximo 5, sin estado -- el backend no tiene `/state` para esta
    entidad) y Valores (`SRateValue`, con vigencia y activar/inactivar).
    Los encabezados de la grilla de valores muestran el nombre real de
    cada factor (`SFieldDictionary.DesFieldDictionary`) en vez de
    "Factor1"..."Factor5" genérico.
  - **Dos módulos de backend nuevos, descubiertos durante esta fase (no
    parte del pedido original)**: `SChannelType`/`SDistributionChannel`/
    `SDistributionWay` no tenían ningún CRUD en ningún servicio (el
    propio comentario de `brokers.service.ts` los daba por "asumidos
    sembrados") -- se agregó `DistributionModule` en `party-service`
    (junto a `BrokersModule`, porque `SDistributionChannel` resuelve FKs
    opcionales a `TBroker`/`TPerson` que ya viven ahí). Y
    `SConcept`/`SConceptType` -- requeridos por
    `SCalculationRule.CodConcept` (obligatorio) y sin CRUD en ningún
    lado -- se agregaron a `CommonCatalogsModule` de
    `reference-data-service` (reference data genuinamente transversal,
    consumida también por `billing-service` y `underwriting-service`).
  - **Dos `include` aditivos más, mismo patrón que en Catálogos
    comunes/Configuración de menú**: `SRiskLevel` en
    `risks.service.ts` y `SInsuranceArea` en
    `insurance-lines.service.ts` (ambos en `product-rating-service`),
    para poder mostrar/precargar la descripción del catálogo padre.
  - `packages/database/scripts/seed-menu-config.js` extendido con el
    ítem padre `CONFIG_PRODUCTOS` ("Configuración de productos", sin
    `path` propio) y sus 3 hijos (`CATALOGOS_PRODUCTO` →
    `/configuracion-productos/catalogos`, `PRODUCTOS` →
    `/configuracion-productos/productos`, `TARIFAS` →
    `/configuracion-productos/tarifas`), todos con acceso concedido a
    `ADMIN` -- el acceso no se hereda del padre a los hijos, cada uno
    tiene su propia fila de `SSiteMapRole`. El script pasó de "crear si
    falta" a upsert real (actualiza `SSiteMap` si el código ya existía,
    no solo lo deja como estaba) para poder mover `PRODUCTOS`/`TARIFAS`
    de ítems raíz a hijos de `CONFIG_PRODUCTOS` sin duplicar filas. Hace
    falta volver a correr `npm run db:seed-menu-config` (idempotente)
    para que el sidebar quede reorganizado.

**Verificado en pantalla por el usuario, de punta a punta**: `npm install`,
login real, entrada al dashboard, y confirmado que el cartel de licencia
de PrimeNG ya no aparece (bajamos a v21 justamente por eso, ver arriba).

**Sidebar 100% dinámico** (`core/layout/sidebar.component.ts`/`.html`):
ya no tiene links fijos hardcodeados -- decisión explícita del usuario,
tomada al notar que mantenerlos iba a duplicar entradas apenas se
cargaran esas mismas pantallas en `SSiteMap` desde "Configuración de
menú". Si `SApplicationRole`/`SSiteMap`/`SSiteMapRole` están vacíos, el
sidebar va a estar vacío (con un aviso) -- es el comportamiento real y
esperado del endpoint contra una BD sin ese catálogo configurado, no un
bug. `packages/database/scripts/seed-menu-config.js`
(`npm run db:seed-menu-config`, idempotente) carga las 4 pantallas base
actuales (Inicio, Catálogos, Ubicaciones, Configuración de menú) con el
rol `ADMIN` -- mismo `CodRol` que ya usa el usuario admin real de
`iam-service` (`db:seed-admin-user`), para que se vean apenas se loguee.

**Primera ronda de ajustes de layout** (pedida por el usuario al revisar
la app en pantalla, ver `docs/02-roadmap.md`):
- Un ítem del sidebar con hijos (ej. "Configuración de productos") ya no
  intenta verse igual que un link -- decisión explícita del usuario: se
  ve como encabezado de sección (`sidebar-nav-item.component.ts`, texto
  chico, mayúsculas, tenue, flecha sutil), porque conceptualmente hace
  otra cosa (expande, no navega). Antes se veía igual que un link normal
  pero con una flecha a la derecha, lo que daba la impresión de texto
  "centrado" al ser el único ítem con ese patrón.
- Versión de la app al pie del sidebar (`shell.component.ts`/`.html`):
  `environment.ts::appVersion`, a mano en sync con `version` de
  `package.json` (sin paso de build que lo lea automático todavía).
- **Logo real + color de marca** (el usuario compartió 4 variantes propias:
  azul, gris y violeta): se usó la violeta (`#6D4AEF` muestreado del PNG)
  como color de marca -- decisión propia, autorizada explícitamente por el
  usuario ("podés modificar los colores si lo decidís"). Ninguno de los 4
  archivos tenía transparencia real (son PNG en modo `RGB`, el
  "cuadriculado" que se ve en la vista previa está pintado como píxeles
  normales, confirmado leyendo el canal alfa con Pillow -- no es un canal
  alfa real) así que no se podía recortar el fondo con una key de color
  simple sin arriesgar el brillo/degradé del propio diseño. Se generó en
  cambio un badge cuadrado con esquinas redondeadas y transparencia real
  (`public/brand/logo.png`, hecho con Pillow: recorte al contenido +
  máscara de esquinas redondeadas), que sí compone limpio contra el fondo
  oscuro del sidebar. Mismo asset reescalado como favicon
  (`public/brand/favicon.png`, referenciado en `index.html`).
  El violeta se aplicó como color primario de PrimeNG completo (no solo
  el logo): `app.config.ts::ArsPreset` (`definePreset` sobre `Aura`)
  reemplaza la escala `primary` de fábrica (era "emerald", verde) por una
  escala violeta 50-950 generada a partir del mismo hex -- así todos los
  componentes PrimeNG (botones, focus rings, etc.) usan la marca real sin
  tocarlos uno por uno. Mismo hex expuesto a Tailwind vía `@theme` en
  `styles.css` (`--color-brand-*`), usado en el estado activo del sidebar
  (`sidebar-nav-item.component.ts`: `bg-brand-600/25` en vez de
  `bg-slate-800` genérico).
  **Pendiente, a la espera del usuario**: una sección de "pendientes
  reales" en el header (`header.component.ts`) armada contra la máquina
  de estados existente (ej. cotizaciones en Borrador, no una tabla de
  tareas nueva) -- queda para una pasada aparte una vez definido qué
  estados/entidades contar.

## Cómo correrlo

Desde la raíz del monorepo, con tu Node normal (no hace falta nvm ni
ninguna versión especial):

```bash
npm install

npm run start:gateway     # otra terminal
npm run start:iam         # otra terminal
npm run start --workspace=apps/backoffice
```

Se abre en `http://localhost:4200`. `src/environments/environment.ts`
apunta a `http://localhost:3000` (el gateway) en desarrollo.

Si `npm install` tira un error de dependencias, pegámelo tal cual y lo
corrijo -- mismo patrón que ya usamos con el error de `prisma generate`.

**Verificación rápida sin levantar el server completo**: `npm run
type-check --workspace=apps/backoffice` corre el compilador real de
Angular (`ngc`) sin pasar por Tailwind -- útil para chequear cambios
rápido.

## Qué sigue

- Cotización: la pantalla de cotizar contra `underwriting-service`, ahora
  que todos los catálogos que necesita (`codProduct`,
  `codDistributionChannel`, `codDistributionWay`, `codRiskProduct`, etc.)
  ya existen y tienen UI de administración. Contratación después.
