import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, MessageModule, TranslocoPipe],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  readonly step = signal<'credentials' | 'twoFactor'>('credentials');
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  private twoFactorToken = '';

  readonly credentialsForm = this.fb.nonNullable.group({
    userName: ['', Validators.required],
    password: ['', Validators.required],
  });

  readonly codeForm = this.fb.nonNullable.group({
    code: ['', Validators.required],
  });

  async submitCredentials(): Promise<void> {
    if (this.credentialsForm.invalid) return;
    this.loading.set(true);
    this.errorMessage.set(null);
    const { userName, password } = this.credentialsForm.getRawValue();
    try {
      const result = await this.auth.login(userName, password);
      if (result.requiresTwoFactor && result.twoFactorToken) {
        this.twoFactorToken = result.twoFactorToken;
        this.step.set('twoFactor');
      } else {
        await this.router.navigateByUrl('/dashboard');
      }
    } catch {
      this.errorMessage.set(this.transloco.translate('login.credentialsError'));
    } finally {
      this.loading.set(false);
    }
  }

  async submitCode(): Promise<void> {
    if (this.codeForm.invalid) return;
    this.loading.set(true);
    this.errorMessage.set(null);
    const { code } = this.codeForm.getRawValue();
    try {
      await this.auth.verifyTwoFactor(this.twoFactorToken, code);
      await this.router.navigateByUrl('/dashboard');
    } catch {
      this.errorMessage.set(this.transloco.translate('login.codeError'));
    } finally {
      this.loading.set(false);
    }
  }

  backToCredentials(): void {
    this.step.set('credentials');
    this.codeForm.reset();
    this.errorMessage.set(null);
  }
}
