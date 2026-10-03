import { Component, Input, OnChanges, SimpleChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Diagnostics, StateMachineAdminService } from './state-machine-admin.service';

/** Pestaña "Diagnóstico": revisa TODA la configuración (reglas ambiguas,
 *  entidades sin o con varias reglas iniciales, reglas imposibles de
 *  ejecutar) -- útil si algo se tocó fuera de esta pantalla (scripts, SQL). */
@Component({
  selector: 'app-diagnostics-tab',
  standalone: true,
  imports: [CommonModule, ButtonModule, MessageModule, TableModule, TagModule, ToastModule, TranslocoPipe],
  providers: [MessageService],
  templateUrl: './diagnostics-tab.component.html',
})
export class DiagnosticsTabComponent implements OnChanges {
  @Input() refreshToken = 0;

  private readonly api = inject(StateMachineAdminService);
  private readonly messages = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  readonly result = signal<Diagnostics | null>(null);
  readonly loading = signal(false);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['refreshToken']) this.run();
  }

  run(): void {
    this.loading.set(true);
    this.api.diagnostics().subscribe({
      next: (res) => {
        this.result.set(res);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        const detail =
          (err.error && typeof err.error === 'object' && 'message' in err.error
            ? String((err.error as { message: unknown }).message)
            : null) ?? this.transloco.translate<string>('common.unexpectedError');
        this.messages.add({ severity: 'error', summary: this.transloco.translate('common.error'), detail });
      },
    });
  }
}
