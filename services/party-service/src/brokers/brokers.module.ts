import { Module } from '@nestjs/common';
import { PartyStateMachineModule } from '../state-machine/party-state-machine.module';
import { BrokersController } from './brokers.controller';
import { BrokersService } from './brokers.service';
import { BrokerTypesController } from './broker-types.controller';
import { BrokerTypesService } from './broker-types.service';
import { CommissionTreesController } from './commission-trees.controller';
import { CommissionTreesService } from './commission-trees.service';
import { CommissionTablesController } from './commission-tables.controller';
import { CommissionTablesService } from './commission-tables.service';
import { CommissionsController } from './commissions.controller';
import { CommissionsService } from './commissions.service';
import { CommissionProductsController } from './commission-products.controller';
import { CommissionProductsService } from './commission-products.service';
import { ProcessesController } from './processes.controller';
import { ProcessesService } from './processes.service';

/**
 * Tercera parte del alcance de `party-service` (ver su README):
 * brokers/comercial (`TBroker`, árbol de comisiones por canal
 * `SCommissionTree`/`SCommissionTable`/`SCommission`, y el split de
 * comisión entre canales `SCommissionProduct`) -- confirmado contra el
 * código real que NINGUNA de las 5 tiene función PL/pgSQL propia de
 * escritura (`brokers.service.ts`/`commission-products.service.ts`
 * tienen el detalle completo), así que es CRUD administrativo diseñado
 * de cero, no una réplica de lógica de negocio existente. `BrokerTypesController`/
 * `BrokerTypesService` (`SBrokerType`) se suman acá mismo -- catálogo que este
 * módulo ya daba por "asumido sembrado" pero nunca tuvo CRUD propio, hasta que
 * la pantalla de Corredores del backoffice necesitó un selector real.
 *
 * Ya usado en la práctica por `underwriting-service`:
 * `resolveCommissionPercentage`/`generateReceipts` calculan la comisión
 * real de un recibo con `SCommissionTree`/`SCommissionTable`/
 * `SCommission`, y `setContractDistributionChannel` (equivalente a
 * `FContractDistributionChannel('SETQUOTE', ...)`) lee `SCommissionProduct`
 * para armar el split de canales del contrato -- este módulo es lo que
 * faltaba para darlas de alta sin tocar la BD a mano.
 *
 * `SCommissionProduct` es la única de las 5 con función PL/pgSQL real de
 * LECTURA que la consume (`FContractDistributionChannel`), y esa función
 * no filtra por `NumMovement` ni vigencia -- toma todas las filas
 * `Activa` que matcheen (producto, canal origen). Por eso su CRUD, a
 * propósito, NO versiona: `update()` edita en el lugar en vez de crear
 * una fila nueva (decisión explícita del usuario, ver
 * `commission-products.service.ts` y `docs/02-roadmap.md`).
 */
@Module({
  imports: [PartyStateMachineModule],
  controllers: [
    BrokersController,
    BrokerTypesController,
    CommissionTreesController,
    CommissionTablesController,
    CommissionsController,
    CommissionProductsController,
    ProcessesController,
  ],
  providers: [
    BrokersService,
    BrokerTypesService,
    CommissionTreesService,
    CommissionTablesService,
    CommissionsService,
    CommissionProductsService,
    ProcessesService,
  ],
})
export class BrokersModule {}
