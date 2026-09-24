/**
 * Puerto para resolver, dado un producto/canal/vía/riesgo puntual, qué
 * `SProcessFlow` aplica y qué `SStep` están activos en él -- pieza que
 * faltaba de la narrativa original "flujos de contratación configurables
 * por canal/producto" (`SProcessFlow`/`SFlowStep`/`SStep`, ver
 * docs/01-especificacion-motor-negocio-actual.md §5 y
 * docs/02-roadmap.md): la CONFIGURACIÓN (`SStep`/`SScreen`/`SProcessFlow`/
 * `SFlowStep`) ya tenía CRUD en `reference-data-service` desde la fase
 * del motor de atributos, pero nunca se conectó con ningún consumidor
 * real -- este es el primer consumidor.
 *
 * Mismo patrón que `SocialImpactConfigResolver`/`AdjustmentValueResolver`:
 * `shared-common` no depende de Prisma, cada servicio conecta la
 * implementación real (`PrismaProcessFlowResolver` en
 * `@ars-platform/database`) vía `ProcessFlowModule.forRoot(...)`, resuelto
 * EN PROCESO (mismo Postgres, sin llamada HTTP entre servicios).
 *
 * Alcance deliberado de esta primera vuelta (decisión explícita del
 * usuario, 23/09/2026): esto es un REGISTRO DE MEMBRESÍA de pasos por
 * flujo, no la ejecución real del grafo (`FPInstanceFlow`/
 * `TFlowStepInstance`, bifurcación por `IndResultOK`, orden real) -- eso
 * queda para una vuelta futura si hace falta. `resolveActiveSteps` junta
 * TODOS los `CodStep` que aparecen como `IdeStepCurrent` o
 * `IdeStepForward` en los `SFlowStep` del flujo asignado, sin interpretar
 * el grafo ni el orden.
 *
 * Comportamiento por defecto explícitamente SEGURO: si no hay ningún
 * `SProductProcessFlow` configurado para la combinación pedida,
 * `ideProcessFlow` viene `null` y `activeSteps` viene vacío -- los
 * consumidores (`QuotesService`, `QuotesComponent`) deben tratar
 * `ideProcessFlow === null` como "sin config, no cambiar el
 * comportamiento existente", NUNCA como "flujo vacío, ocultar todo".
 * Así ningún producto ya configurado (ej. mascotas, con Impacto Social y
 * Atributos personalizados ya probados en producción) deja de funcionar
 * el día que esto se despliega -- hay que asignarle un
 * `SProductProcessFlow` explícito recién cuando se lo quiera empezar a
 * gobernar desde acá.
 */
export interface ProductStepsQuery {
  ideProduct: string;
  ideDistributionChannel: string;
  /** Opcional -- Impacto Social se resuelve a nivel de producto, no de
   *  riesgo puntual, así que este campo puede omitirse en ese caso. */
  ideRiskProduct?: string;
  ideDistributionWay?: string;
}

export interface ProductStepsResolution {
  /** `null` = no hay ningún `SProductProcessFlow` configurado para esta
   *  combinación -- ver el comentario de arriba sobre el comportamiento
   *  por defecto seguro. */
  ideProcessFlow: string | null;
  /** `CodStep` de todos los pasos que aparecen en los `SFlowStep` del
   *  flujo resuelto (unión de paso actual + paso siguiente, sin orden). */
  activeSteps: string[];
}

/**
 * Puerto de resolución. Implementación real: `PrismaProcessFlowResolver`
 * en `@ars-platform/database`.
 */
export interface ProcessFlowResolver {
  resolveActiveSteps(query: ProductStepsQuery): Promise<ProductStepsResolution>;
}

export const PROCESS_FLOW_RESOLVER = Symbol('PROCESS_FLOW_RESOLVER');

/** `CodStep` reservados que el código ya interpreta explícitamente (mismo
 *  criterio que `'SOCIAL_IMPACT'` en `AppliedAdjustment`/`codAdjustment`)
 *  -- el usuario debe crear estos `SStep` con estos códigos EXACTOS desde
 *  la pantalla de administración para que el gating funcione. Un
 *  `SProductProcessFlow` que no los incluya en su flujo asignado hace que
 *  ese paso se oculte para ese producto/canal. */
export const STEP_CODE_CUSTOM_ATTRIBUTES = 'ATRIBUTOS_PERSONALIZADOS';
export const STEP_CODE_SOCIAL_IMPACT = 'IMPACTO_SOCIAL';
