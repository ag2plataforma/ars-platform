# billing-service

Sustituye a: `ag2paymentgateway` + la lógica de recibos hoy repartida entre `FReceipt`, `FReceipt_GetNumber` y `FMovementConcept`.

Alcance original: recibos (`TReceipt`, `TReceiptDetail`), periodos de facturación (`TContractBilling`), y el cálculo de comisiones por árbol de canal (`SCommissionTree`/`SCommissionTable`/`SCommission`) hoy dentro de `FReceipt`.

**Corrección de alcance (2026-09-18)**: para cuando le tocó su turno a este servicio, buena parte de eso ya había quedado implementado en otro lado. `underwriting-service` (`ContractsService.generateReceipts`) ya genera `TReceipt`/`TReceiptDetail` de verdad -- con su comisión real -- como parte de la cascada transaccional de creación/cancelación de contrato; moverlo acá significaría romper esa atomicidad (una llamada HTTP entre servicios no puede formar parte de la misma transacción de Postgres), así que se queda donde está. El CRUD del árbol de comisiones (`SCommissionTree`/`SCommissionTable`/`SCommission`, más el split `SCommissionProduct`) ya se implementó en `party-service` (`BrokersModule`), no acá. `TContractBilling` tampoco es un catálogo administrable: se genera automáticamente por contrato (`setContractBilling`), no hay nada que un admin necesite dar de alta.

Lo único del alcance original que sigue genuinamente sin dueño es el reemplazo real de `ag2paymentgateway` (cobrar/registrar el pago real de un recibo): no hay ninguna tabla de pagos sobre `TReceipt` en el esquema (existe `TApproval`, pero es de aprobación de pagos de **siniestros**, dominio de `claims-service`, no de cobranza de recibos), y no es una de las 44 funciones PL/pgSQL ya investigadas en la Fase 0 -- implementarlo sería diseño nuevo de cero, no una réplica de comportamiento legacy confirmado. Queda deliberadamente afuera hasta que haya una necesidad concreta (ej. un gateway de pago real elegido).

## Estado actual

Primer módulo de negocio real: `BillingModule`, solo lectura sobre lo que `underwriting-service` ya escribe.

- `GET /receipts?ideContract=&ideContractFile=` -- lista `TReceipt` (con `SReceiptType`/`SState`), más reciente primero.
- `GET /receipts/:id` -- detalle de un recibo con su desglose completo (`TReceiptDetail` por concepto, incluyendo la comisión sintetizada, con `SConcept`/`SInsuranceLine`/`SState`).
- `GET /contract-billing?ideContract=` -- lista los períodos de facturación (`TContractBilling`) de un contrato, ordenados por `NumPeriod`.
- `GET /contract-billing/:id` -- detalle de un período puntual.

Lectura abierta a cualquier usuario autenticado (sin restricción de rol -- son endpoints de consulta, no de escritura). No hay endpoints de escritura todavía: la operación de marcar un período como facturado (`FContractBilling('BILL', ...)` en el original) no se re-confirmó contra el código fuente real, así que no se expone.

## Cómo correrlo

```bash
cp services/billing-service/.env.example services/billing-service/.env   # completar JWT_SECRET con el MISMO valor que usa iam-service
npm run start:billing
```

O en modo watch: `npm run start:billing:watch`.
