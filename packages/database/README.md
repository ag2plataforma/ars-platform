# @ars-platform/database

Cliente Prisma compartido. En vez de que cada servicio tenga su propia copia del esquema (como pasaba con `util.service.ts`/`jwt.service.ts` en el sistema v1), todos los servicios importan el cliente generado desde aquí.

## Puesta en marcha (una vez confirmada la migración `db:migrate` de la raíz del repo)

1. Copia tu connection string a `packages/database/.env` (mismo valor que en `services/iam-service/.env`, ya apuntando al esquema nuevo):
   ```
   DATABASE_URL=...?schema=ars_platform
   ```
2. Instala dependencias (desde la raíz del repo, por los workspaces):
   ```bash
   npm install
   ```
3. Introspecciona el esquema real (genera los modelos a partir de las tablas que ya existen en `ars_platform`):
   ```bash
   npm run db:pull --workspace=packages/database
   ```
   Esto reescribe `prisma/schema.prisma` con los 130 modelos reales. Revísalo y confírmalo/commitéalo — es la fuente de verdad versionada del modelo de datos.
4. Genera el cliente TypeScript:
   ```bash
   npm run db:generate --workspace=packages/database
   ```

## Qué exporta este paquete (ya implementado)

- **`PrismaService`** — el cliente Prisma como servicio inyectable de Nest (conecta/desconecta con el ciclo de vida del módulo).
- **`PrismaModule`** — módulo global; se importa una vez en el `AppModule` de cada servicio y `PrismaService` queda disponible en todos sus módulos.
- **`PrismaStateRuleRepository`** — implementación real de `StateRuleRepository` (el contrato de `@ars-platform/shared-common`) contra `SEntity`/`SStateRule`/`SState`, replicando exactamente la lógica de `FGetState`. Cualquier servicio la conecta así:

  ```ts
  // en el AppModule (o un módulo dedicado) del servicio
  imports: [PrismaModule, StateMachineModule],
  providers: [
    { provide: STATE_RULE_REPOSITORY, useClass: PrismaStateRuleRepository },
  ],
  ```

  Ver `services/iam-service/src/state-machine/iam-state-machine.module.ts` como ejemplo funcional completo.

A medida que se implementen más repositorios (motor de reglas, usuarios, etc.) se añaden aquí siguiendo el mismo patrón: un archivo en `src/repositories/`, exportado desde `src/index.ts`.

## Por qué Prisma y no TypeORM

El esquema ya existe y es grande (130 tablas). La introspección de Prisma (`db pull`) genera el modelo completo en segundos sin escribir 130 entidades a mano, y da un cliente completamente tipado. TypeORM también puede trabajar con un esquema existente, pero requiere más configuración manual por entidad.
