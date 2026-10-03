import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MessageModule } from 'primeng/message';
import { TabsModule } from 'primeng/tabs';
import { TranslocoPipe } from '@jsverse/transloco';
import { StateRulesTabComponent } from './state-rules-tab.component';
import { StatesTabComponent } from './states-tab.component';
import { EntitiesTabComponent } from './entities-tab.component';
import { DiagnosticsTabComponent } from './diagnostics-tab.component';

/**
 * "Máquina de estados" -- administración de `SState`/`SEntity`/`SStateRule`
 * (pedido explícito del usuario, 2026-10-03, tras normalizar los `SEED_*`).
 * Es una configuración GLOBAL de la que dependen cotizaciones, contratos y
 * siniestros, y los cambios rigen de inmediato (el backend no cachea): la
 * pantalla lo avisa arriba y el backend valida todo (ver
 * `StateMachineAdminService`).
 */
@Component({
  selector: 'app-state-machine',
  standalone: true,
  imports: [
    CommonModule,
    MessageModule,
    TabsModule,
    StateRulesTabComponent,
    StatesTabComponent,
    EntitiesTabComponent,
    DiagnosticsTabComponent,
    TranslocoPipe,
  ],
  templateUrl: './state-machine.component.html',
})
export class StateMachineComponent {
  readonly activeTab = signal<string | number>('rules');
  /** Entidad que la pestaña "Reglas" debe mostrar (la fija "Ver reglas" en Entidades). */
  readonly selectedEntityId = signal<string | null>(null);
  /** Se incrementa al cambiar estados/entidades, para que las demás pestañas recarguen sus listas. */
  readonly refreshToken = signal(0);

  openRules(ideEntity: string): void {
    this.selectedEntityId.set(ideEntity);
    this.activeTab.set('rules');
  }

  bumpRefresh(): void {
    this.refreshToken.update((n) => n + 1);
  }
}
