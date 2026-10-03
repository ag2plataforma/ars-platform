import { Component, Input, OnDestroy, OnInit, forwardRef, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { MenuNode } from './site-map.service';

/** Ítem recursivo del menú lateral -- `SSiteMap` real soporta hasta 3
 * niveles. Un ítem CON hijos (ej. "Configuración de productos") no es un
 * link -- expande/colapsa, nunca navega.
 *
 * Paleta blanca (2026-09-27, pedido explícito del usuario, "probar" un
 * look más moderno): texto en gris oscuro (antes blanco sobre
 * `bg-slate-900`), estado activo con fondo morado claro (`bg-brand-50`) +
 * texto morado en vez del morado semitransparente que solo se veía bien
 * sobre fondo oscuro, e íconos SIEMPRE en `text-brand-600` (el morado de
 * marca) sin importar el estado -- pedido literal del usuario, así que el
 * color del ícono no hereda del texto activo/hover.
 *
 * Tipografía del botón "padre" (con submenú) unificada con la del link
 * "hijo" (mismo `text-sm`, mismo gap/ícono/padding) -- también pedido
 * explícito del usuario, segunda vuelta sobre una decisión anterior que
 * los había hecho lucir distintos (chico, mayúsculas, tenue) para evitar
 * que el texto quedara "flotando" entre el ícono y la flecha. La flecha
 * (`pi-chevron-down`/`pi-chevron-up`) sigue siendo la única señal de que
 * el ítem expande en vez de navegar.
 */
@Component({
  selector: 'app-sidebar-nav-item',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, forwardRef(() => SidebarNavItemComponent)],
  template: `
    @if (node.Referencia && !hasChildren) {
      <a
        [routerLink]="node.Referencia"
        routerLinkActive="bg-brand-50 font-medium text-brand-700"
        class="flex items-center gap-2.5 rounded-lg py-2 pr-3 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
        [style.paddingLeft.rem]="0.75 + depth * 0.75"
      >
        @if (node.Imagen) {
          <i class="pi {{ node.Imagen }} text-base text-brand-600"></i>
        }
        <span>{{ node.Titulo }}</span>
      </a>
    } @else {
      <button
        type="button"
        (click)="expanded.set(!expanded())"
        class="flex w-full items-center justify-between gap-2.5 rounded-lg py-2 pr-3 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
        [style.paddingLeft.rem]="0.75 + depth * 0.75"
      >
        <span class="flex items-center gap-2.5">
          @if (node.Imagen) {
            <i class="pi {{ node.Imagen }} text-base text-brand-600"></i>
          }
          <span>{{ node.Titulo }}</span>
        </span>
        <i
          class="pi text-xs text-slate-400"
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
export class SidebarNavItemComponent implements OnInit, OnDestroy {
  @Input({ required: true }) node!: MenuNode;
  @Input() depth = 0;

  private readonly router = inject(Router);
  private routerSub?: Subscription;

  readonly expanded = signal(false);

  get hasChildren(): boolean {
    return !!this.node.Submenu && this.node.Submenu.length > 0;
  }

  /** Gap detectado durante la ronda de modernización del sidebar
   * (2026-09-27): con `expanded` siempre arrancando en `false`, un
   * usuario que recarga la página (o entra por un link directo) estando
   * dentro de una sección hija ve el menú padre colapsado, aunque su
   * ruta activa esté ahí adentro -- desorientador justo después de un
   * rediseño que le dio tanto protagonismo visual al sidebar. Se
   * resuelve expandiendo automáticamente cualquier padre cuya ruta
   * activa caiga dentro de su propio árbol, tanto al montar como en cada
   * navegación subsiguiente. Deliberadamente unidireccional (solo
   * expande, nunca colapsa): si el usuario abrió una sección a mano y
   * después navega a algo fuera de ella, no se le cierra de golpe lo que
   * dejó abierto a propósito. */
  ngOnInit(): void {
    this.syncExpandedWithRoute(this.router.url);
    this.routerSub = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.syncExpandedWithRoute(event.urlAfterRedirects));
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
  }

  private syncExpandedWithRoute(url: string): void {
    if (this.hasChildren && this.routeMatchesDescendant(this.node, url)) {
      this.expanded.set(true);
    }
  }

  private routeMatchesDescendant(node: MenuNode, url: string): boolean {
    const path = url.split('?')[0];
    if (node.Referencia && (path === node.Referencia || path.startsWith(`${node.Referencia}/`))) {
      return true;
    }
    return (node.Submenu ?? []).some((child) => this.routeMatchesDescendant(child, url));
  }
}
