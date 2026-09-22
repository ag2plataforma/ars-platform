import { Component, Input, forwardRef, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MenuNode } from './site-map.service';

/** Ítem recursivo del menú lateral -- `SSiteMap` real soporta hasta 3
 * niveles. Un ítem CON hijos (ej. "Configuración de productos") no es un
 * link -- expande/colapsa, nunca navega -- así que se ve deliberadamente
 * distinto a uno sin hijos: encabezado de sección (chico, mayúsculas,
 * tenue) en vez de imitar el estilo de link, que antes hacía que el
 * texto se viera "flotando" entre el ícono y la flecha (decisión
 * explícita del usuario, ver docs/02-roadmap.md). */
@Component({
  selector: 'app-sidebar-nav-item',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, forwardRef(() => SidebarNavItemComponent)],
  template: `
    @if (node.Referencia && !hasChildren) {
      <a
        [routerLink]="node.Referencia"
        routerLinkActive="bg-brand-600/25 text-white"
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
        class="flex w-full items-center justify-between gap-2 rounded-lg py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-slate-500 transition-colors hover:bg-slate-800/60 hover:text-slate-300"
        [style.paddingLeft.rem]="0.75 + depth * 0.75"
      >
        <span class="flex items-center gap-2">
          @if (node.Imagen) {
            <i class="pi {{ node.Imagen }} text-sm"></i>
          }
          {{ node.Titulo }}
        </span>
        <i
          class="pi text-[0.55rem]"
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
