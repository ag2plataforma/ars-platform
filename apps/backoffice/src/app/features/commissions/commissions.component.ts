import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TabsModule } from 'primeng/tabs';
import { TranslocoPipe } from '@jsverse/transloco';
import { CommissionTreesTabComponent } from './commission-trees-tab.component';
import { CommissionTablesTabComponent } from './commission-tables-tab.component';
import { CommissionsTabComponent } from './commissions-tab.component';
import { CommissionProductsTabComponent } from './commission-products-tab.component';

/**
 * "Comisiones" (`BrokersModule` de `party-service`, sin la pestaña de
 * Corredores/`TBroker` -- decisión explícita del usuario 23/09/2026,
 * "las 4 de comisión, sin Corredores": eso necesita un buscador de
 * `TPerson` y queda para otra vuelta). Mismo criterio que "Configuración
 * de menú": una sola página con pestañas para 4 entidades fuertemente
 * relacionadas entre sí (un árbol pertenece a un canal, una tabla a un
 * árbol, una comisión a una tabla) en vez de 4 rutas separadas.
 *
 * Nace de un caso real (ver docs/02-roadmap.md, "Comisión no generada al
 * canal de distribución en una contratación de prueba"): el canal
 * "Canal B2C" no tenía ningún `SCommissionTree` cargado y el recibo del
 * contrato salió con `Fee=0` -- se resolvió puntualmente con un script,
 * y esta pantalla es lo que faltaba para no tener que volver a tocar la
 * base de datos a mano la próxima vez.
 */
@Component({
  selector: 'app-commissions',
  standalone: true,
  imports: [
    CommonModule,
    TabsModule,
    CommissionTreesTabComponent,
    CommissionTablesTabComponent,
    CommissionsTabComponent,
    CommissionProductsTabComponent,
    TranslocoPipe,
  ],
  templateUrl: './commissions.component.html',
})
export class CommissionsComponent {
  readonly activeTab = signal<string | number>('trees');
}
