import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CreatePersonPayload, PersonsService } from '../../core/party/persons.service';

/**
 * Alta de una persona nueva (`POST /persons`) -- pantalla "Personas"
 * (CRM-lite, docs/02-roadmap.md item 6), alcance "crear" pedido
 * explícitamente por el usuario. Página propia en `/personas/nueva` (no
 * un `p-dialog`) -- mismo criterio que `cotizacion/nueva`/
 * `siniestros/nuevo`, único patrón de "alta" que ya existe en el resto
 * del frontend.
 *
 * A diferencia del mini-formulario de Cotización/Corredores (que solo
 * pide lo mínimo para avanzar un flujo puntual), acá se piden también
 * dirección y teléfono móvil opcionales de entrada -- si se completan,
 * se crean con `addAddress`/`addMobilePhone` encadenados tras el
 * `create` (tres llamadas separadas en el backend real, no hay un
 * endpoint "crear todo junto"). Catálogos demográficos secundarios
 * (género, país/localidad, profesión, etc.) quedan afuera, igual que en
 * `PersonDetailComponent` -- sin selector construido todavía.
 */
@Component({
  selector: 'app-person-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ButtonModule, InputTextModule, ToastModule, TranslocoPipe],
  providers: [MessageService],
  templateUrl: './person-form.component.html',
})
export class PersonFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly persons = inject(PersonsService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  readonly saving = signal(false);

  form = this.fb.nonNullable.group({
    desFirstName: ['', Validators.required],
    desMiddleName: [''],
    desLastName1: ['', Validators.required],
    desLastName2: [''],
    desEmail: ['', [Validators.required, Validators.email]],
    numIdentification: [''],
    desAddressLine1: [''],
    desAddressLine2: [''],
    codPostal: [''],
    desPhone: [''],
  });

  guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const payload: CreatePersonPayload = {
      desFirstName: raw.desFirstName,
      desMiddleName: raw.desMiddleName || undefined,
      desLastName1: raw.desLastName1 || undefined,
      desLastName2: raw.desLastName2 || undefined,
      desEmail: raw.desEmail,
      numIdentification: raw.numIdentification || undefined,
    };

    this.saving.set(true);
    this.persons
      .create(payload)
      .pipe(
        switchMap((person) => {
          const followUps = [];
          if (raw.desAddressLine1 && raw.codPostal) {
            followUps.push(this.persons.addAddress(person.IdePerson, { desAddressLine1: raw.desAddressLine1, desAddressLine2: raw.desAddressLine2 || undefined, codPostal: raw.codPostal }));
          }
          if (raw.desPhone) {
            followUps.push(this.persons.addMobilePhone(person.IdePerson, raw.desPhone));
          }
          return followUps.length > 0 ? forkJoin(followUps).pipe(switchMap(() => of(person))) : of(person);
        }),
      )
      .subscribe({
        next: (person) => {
          this.saving.set(false);
          this.messages.add({
            severity: 'success',
            summary: this.transloco.translate('common.done'),
            detail: this.transloco.translate('personForm.createdMessage'),
          });
          this.router.navigate(['/personas', person.IdePerson]);
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          const detail =
            (err.error && typeof err.error === 'object' && 'message' in err.error
              ? String((err.error as { message: unknown }).message)
              : null) ?? this.transloco.translate<string>('common.unexpectedError');
          this.messages.add({ severity: 'error', summary: this.transloco.translate('common.error'), detail });
        },
      });
  }

  cancelar(): void {
    this.router.navigate(['/personas']);
  }
}
