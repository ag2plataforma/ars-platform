import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../../core/auth/auth.service';

/**
 * Pantalla PÚBLICA (`/forgot-password`): pide el correo de login y dispara
 * `POST /iam/auth/forgot-password`. La respuesta del backend es siempre la
 * misma exista o no el usuario (evita enumeración), así que la pantalla
 * también muestra siempre el mismo aviso de "revisá tu correo".
 */
@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, ButtonModule, InputTextModule, MessageModule, TranslocoPipe],
  templateUrl: './forgot-password.component.html',
})
export class ForgotPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly transloco = inject(TranslocoService);

  readonly loading = signal(false);
  readonly sent = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    userName: ['', [Validators.required, Validators.email]],
  });

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      await this.auth.forgotPassword(this.form.getRawValue().userName.trim());
      this.sent.set(true);
    } catch {
      this.errorMessage.set(this.transloco.translate('forgotPassword.error'));
    } finally {
      this.loading.set(false);
    }
  }
}
