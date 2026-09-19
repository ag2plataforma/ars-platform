# apps/backoffice — nuevo frontend Angular del backoffice

Rehecho de cero (Angular 22, standalone components, sin NgModules) sobre el
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
dropdowns) para no reinventarlos -- ahora en su versión 22 con el tema
nuevo basado en tokens ("Aura"), más Tailwind CSS 4 para el layout general.
Ver `docs/02-roadmap.md` para el detalle completo de la decisión (incluida
la alternativa descartada: Tailwind puro sin librería de componentes).

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

**Limitación conocida, no un bug**: `SApplicationRole`/`SSiteMap`/
`SSiteMapRole` todavía no tienen datos reales cargados en la base (nunca se
configuraron), así que el sidebar hoy va a mostrar solo "Inicio" con un
aviso -- es el comportamiento real y esperado del endpoint contra una BD sin
ese catálogo configurado, no algo simulado. Se resuelve solo una vez demos
de alta esas filas -- naturalmente, cuando construyamos el módulo de
Catálogos (próximo paso del roadmap), que va a incluir pantallas para
gestionar justamente eso.

## Cómo correrlo (primera vez)

Esta app **todavía no tiene sus dependencias instaladas** -- el entorno de
trabajo donde se escribió no tiene salida a internet hacia el registro de
npm (misma restricción ya documentada para `prisma generate`, ver
`db/README.md`). Desde tu propia terminal (con internet normal):

```bash
# Desde la raíz del monorepo (instala TODO, backend + este frontend, en un solo paso)
npm install

# Levantar el backoffice en modo desarrollo
npm run start --workspace=apps/backoffice
# (equivalente: cd apps/backoffice && npm start)
```

Se abre en `http://localhost:4200`. Antes necesitás el `gateway` y
`iam-service` corriendo (`npm run start:gateway`, `npm run start:iam`, o
sus variantes `:watch`) -- `src/environments/environment.ts` apunta a
`http://localhost:3000` (el gateway) en desarrollo.

Si `npm install` tira un error de dependencias (versión de Angular/PrimeNG/
TypeScript que no calzan entre sí -- elegidas por versión más reciente
publicada al momento de escribir esto, sin poder correr `npm install` yo
mismo para confirmarlo), pegámelo tal cual y lo corrijo -- mismo patrón que
ya usamos con el error de `prisma generate`.

**Nota sobre licenciamiento de PrimeNG (cambio real desde la v16 que usaba
el backoffice viejo, no algo de esta app puntual)**: PrimeNG pasó a un
esquema de licencia por niveles. Los componentes core (los que usa esta
app: `Button`, `InputText`, `Message`, `Avatar`, `Tooltip`, etc.) siguen
siendo gratuitos bajo la licencia "Community" para desarrolladores
independientes/empresas chicas (menos de 5 desarrolladores, menos de
USD 1M de facturación anual) -- sin necesidad de una license key para
usarlos, esa exigencia es solo para los componentes "PRO" pagos
(Scheduler, Charts, DataGrid, etc.), que esta app no usa. Dado el perfil
del proyecto (un solo desarrollador) debería aplicar sin problema, pero
te lo señalo porque es una condición real del negocio, no algo que yo
pueda decidir por vos -- si en algún momento la empresa crece más allá de
esos límites, hay que revisar la licencia comercial.

## Qué sigue

Primer módulo de negocio real sobre este esqueleto: Catálogos/diccionario
(`reference-data-service`) -- decidido explícitamente con el usuario como
punto de partida por ser el patrón CRUD más simple y repetido, antes de ir
a flujos más complejos (cotización, contratación).
