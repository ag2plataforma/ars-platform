import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './header.component';
import { SidebarComponent } from './sidebar.component';
import { TranslocoPipe } from '@jsverse/transloco';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, SidebarComponent, TranslocoPipe],
  templateUrl: './shell.component.html',
})
export class ShellComponent {
  readonly appVersion = environment.appVersion;
}
