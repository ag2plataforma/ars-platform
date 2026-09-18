import { Module } from '@nestjs/common';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';
import { ContractBillingController } from './contract-billing.controller';
import { ContractBillingService } from './contract-billing.service';

/**
 * Primer módulo de negocio real de `billing-service`: solo lectura sobre
 * recibos (`TReceipt`/`TReceiptDetail`) y períodos de facturación
 * (`TContractBilling`).
 *
 * Decisión explícita del usuario (ver `docs/02-roadmap.md`): buena parte
 * del alcance que describía originalmente el README de este servicio ya
 * quedó cubierta en otro lado antes de que a este le tocara su turno --
 * `underwriting-service` ya genera los recibos de verdad (con su comisión
 * real) dentro de la cascada transaccional de creación/cancelación de
 * contrato, y `party-service` ya tiene el CRUD del árbol de comisiones
 * (`SCommissionTree`/`SCommissionTable`/`SCommission`). No se duplica ni
 * se migra esa lógica acá -- este módulo solo CONSULTA lo que esos
 * servicios ya escriben, contra el mismo Postgres compartido.
 *
 * Lo único del alcance original que sigue genuinamente sin dueño es el
 * reemplazo real de `ag2paymentgateway` (cobranza/pago real de un
 * recibo): queda deliberadamente afuera de esta ronda porque no hay
 * ninguna tabla de pagos sobre `TReceipt` en el esquema (se investigó
 * `TApproval`, pero es de aprobación de pagos de siniestros, dominio de
 * `claims-service`, no de cobranza de recibos) y no es una de las 44
 * funciones PL/pgSQL ya investigadas en la Fase 0 -- implementarlo sería
 * diseño nuevo de cero, no una réplica de comportamiento legacy
 * confirmado, así que espera a que haya una necesidad concreta (ej. un
 * gateway de pago real elegido).
 */
@Module({
  controllers: [ReceiptsController, ContractBillingController],
  providers: [ReceiptsService, ContractBillingService],
})
export class BillingModule {}
