import { Component, computed } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [TranslocoPipe],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  constructor(private readonly auth: AuthService) {}
  readonly userCode = computed(() => this.auth.payload()?.code ?? '');
}
