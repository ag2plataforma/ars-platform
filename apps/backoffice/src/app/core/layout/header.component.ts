import { Component, computed } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { AvatarModule } from 'primeng/avatar';
import { TooltipModule } from 'primeng/tooltip';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [ButtonModule, AvatarModule, TooltipModule],
  templateUrl: './header.component.html',
})
export class HeaderComponent {
  constructor(private readonly auth: AuthService) {}

  readonly userCode = computed(() => this.auth.payload()?.code ?? '');
  readonly userInitial = computed(() => (this.userCode() || '?').charAt(0).toUpperCase());

  logout(): void {
    this.auth.logout();
  }
}
