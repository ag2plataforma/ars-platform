import { Component, Input, forwardRef, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MenuNode } from './site-map.service';

/** Ítem recursivo del menú lateral -- `SSiteMap` real soporta hasta 3 niveles. */
@Component({
  selector: 'app-sidebar-nav-item',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, forwardRef(() => SidebarNavItemComponent)],
  template: `
    @if (node.Referencia && !hasChildren) {
      <a
        [routerLink]="node.Referencia"
        routerLinkActive="bg-slate-800 text-white"
        class="flex items-center gap-2 rounded-lg py-2 pr-3 text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
        [style.paddingLeft.rem]="0.75 + depth * 0.75"
      >
        @if (node.Imagen) {
          <i class="pi {{ node.Imagen }} text-base"></i>
        }
        <span>{{ node.Titulo }}</span>
      </a>
    } @else {
      <button
        type="button"
        (click)="expanded.set(!expanded())"
        class="flex w-full items-center justify-between gap-2 rounded-lg py-2 pr-3 text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
        [style.paddingLeft.rem]="0.75 + depth * 0.75"
      >
        <span class="flex items-center gap-2">
          @if (node.Imagen) {
            <i class="pi {{ node.Imagen }} text-base"></i>
          }
          {{ node.Titulo }}
        </span>
        <i
          class="pi text-[0.65rem]"
          [class.pi-chevron-down]="!expanded()"
          [class.pi-chevron-up]="expanded()"
        ></i>
      </button>
      @if (expanded()) {
        <div class="mt-0.5 flex flex-col gap-0.5">
          @for (child of node.Submenu; track child.Orden + child.Titulo) {
            <app-sidebar-nav-item [node]="child" [depth]="depth + 1" />
          }
        </div>
      }
    }
  `,
})
export class SidebarNavItemComponent {
  @Input({ required: true }) node!: MenuNode;
  @Input() depth = 0;

  readonly expanded = signal(false);

  get hasChildren(): boolean {
    return !!this.node.Submenu && this.node.Submenu.length > 0;
  }
}
