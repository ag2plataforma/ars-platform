import { Component, OnInit, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../../core/auth/auth.service';

const passwordsMatch = (group: AbstractControl): ValidationErrors | null => {
  const a = group.get('newPassword')?.value;
  const b = group.get('confirmPassword')?.value;
  return a && b && a !== b ? { mismatch: true } : null;
};

/**
 * Pantalla PÚBLICA (`/reset-password?token=...`): destino del enlace del
 * correo de recuperación. Fija la contraseña nueva con
 * `POST /iam/auth/reset-password` (mínimo 8 caracteres, igual que el backend).
 * El enlace es de un solo uso y vence a los 30 minutos: si el backend lo
 * rechaza, se muestra el aviso y un acceso para pedir otro.
 */
@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, ButtonModule, InputTextModule, MessageModule, TranslocoPipe],
  templateUrl: './reset-password.component.html',
})
export class ResetPasswordComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly transloco = inject(TranslocoService);

  private token = '';
  readonly hasToken = signal(true);
  readonly loading = signal(false);
  readonly done = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group(
    {
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    this.hasToken.set(this.token.length > 0);
  }

  async submit(): Promise<void> {
    if (this.form.invalid || !this.token) return;
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      await this.auth.resetPassword(this.token, this.form.getRawValue().newPassword);
      this.done.set(true);
    } catch {
      this.errorMessage.set(this.transloco.translate('resetPassword.invalidLink'));
    } finally {
      this.loading.set(false);
    }
  }
}
