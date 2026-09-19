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
  por `core/catalogs/catalog.model.ts::CATALOG_REGISTRY`) reutilizado para
  los 9 -- alta, edición, activar/inactivar con confirmación, todo contra
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

**Verificado en pantalla por el usuario, de punta a punta**: `npm install`,
login real, entrada al dashboard, y confirmado que el cartel de licencia
de PrimeNG ya no aparece (bajamos a v21 justamente por eso, ver arriba).

**Limitación conocida, no un bug**: `SApplicationRole`/`SSiteMap`/
`SSiteMapRole` todavía no tienen datos reales cargados en la base (nunca se
configuraron), así que el sidebar hoy va a mostrar "Inicio" y "Catálogos"
(fijos, hardcodeados en `sidebar.component.html`) más un aviso debajo -- es
el comportamiento real y esperado del endpoint contra una BD sin ese
catálogo configurado, no algo simulado. Se resuelve solo una vez demos de
alta esas filas, probablemente construyendo una pantalla de "Configuración
de menú" (`SetupModule`) más adelante -- ver "Qué sigue".

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

- **Ubicaciones (`SLocation`)**: deliberadamente afuera de la pantalla de
  Catálogos actual -- jerárquico (`codLocationParent`) y con unicidad
  compuesta (`CodLocation`+`IdeCountry`, no un código único global), no
  encaja en el componente genérico de catálogo plano. Amerita una
  pantalla propia (selector de país + árbol/lista de ubicaciones hijas),
  fast-follow natural de este mismo módulo.
- **Configuración de menú (`SetupModule`)**: `SApplication`/
  `SApplicationRole`/`SSiteMap`/`SSiteMapRole` -- cargar datos reales acá
  haría que el sidebar deje de mostrar el aviso de "sin secciones
  configuradas" y empiece a reflejar navegación real por rol.
- Después de esos dos: flujos de negocio más complejos (cotización,
  contratación).
