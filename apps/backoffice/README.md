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

**Verificado en pantalla por el usuario**: login real, entrada al
dashboard -- funciona end-to-end.

**Limitación conocida, no un bug**: `SApplicationRole`/`SSiteMap`/
`SSiteMapRole` todavía no tienen datos reales cargados en la base (nunca se
configuraron), así que el sidebar hoy va a mostrar solo "Inicio" con un
aviso -- es el comportamiento real y esperado del endpoint contra una BD sin
ese catálogo configurado, no algo simulado. Se resuelve solo una vez demos
de alta esas filas -- naturalmente, cuando construyamos el módulo de
Catálogos (próximo paso del roadmap), que va a incluir pantallas para
gestionar justamente eso.

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

Primer módulo de negocio real sobre este esqueleto: Catálogos/diccionario
(`reference-data-service`) -- decidido explícitamente con el usuario como
punto de partida por ser el patrón CRUD más simple y repetido, antes de ir
a flujos más complejos (cotización, contratación).
