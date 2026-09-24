import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { PRODUCT_CATALOG_REGISTRY, PROCESS_FLOW_CATALOG_REGISTRY, CLAIMS_CATALOG_REGISTRY } from './core/catalogs/catalog.model';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    loadComponent: () => import('./core/layout/shell.component').then((m) => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        // Listado (landing) + wizard, separados en dos rutas hijas --
        // pedido explícito del usuario: `GET /quotes` (plural) para
        // listar/retomar una cotización existente, ver
        // `docs/02-roadmap.md`. Orden importante: 'nueva' (segmento
        // literal) debe declararse ANTES que ':id' (parámetro) -- si no,
        // ':id' matchea primero y navegar a "nueva" la trataría como un
        // id de cotización cualquiera.
        path: 'cotizacion',
        children: [
          {
            path: '',
            pathMatch: 'full',
            loadComponent: () =>
              import('./features/quotes/quotes-list.component').then((m) => m.QuotesListComponent),
          },
          {
            path: 'nueva',
            loadComponent: () =>
              import('./features/quotes/quotes.component').then((m) => m.QuotesComponent),
          },
          {
            path: ':id',
            loadComponent: () =>
              import('./features/quotes/quotes.component').then((m) => m.QuotesComponent),
          },
        ],
      },
      {
        // Listado (landing) + detalle, mismo patrón que 'cotizacion' --
        // pedido explícito del usuario (ver docs/02-roadmap.md): el
        // p-tag "Contrato <N>" del wizard de Cotización pasa a ser un
        // link real hacia acá. Sin ruta de creación directa -- un
        // contrato solo se genera desde el wizard de Cotización.
        path: 'contratos',
        children: [
          {
            path: '',
            pathMatch: 'full',
            loadComponent: () =>
              import('./features/contracts/contracts-list.component').then((m) => m.ContractsListComponent),
          },
          {
            path: ':id',
            loadComponent: () =>
              import('./features/contracts/contract-detail.component').then((m) => m.ContractDetailComponent),
          },
        ],
      },
      {
        path: 'catalogos',
        loadComponent: () =>
          import('./features/catalogs/catalogs.component').then((m) => m.CatalogsComponent),
      },
      {
        // "Siniestros" -- Fase 4, Etapa 1 (2026-09-24). Orden importante:
        // 'nuevo'/'tipos-de-siniestro'/'catalogos' (segmentos literales)
        // ANTES que ':id' -- mismo motivo que 'nueva' en 'cotizacion'.
        path: 'siniestros',
        children: [
          {
            path: '',
            pathMatch: 'full',
            loadComponent: () =>
              import('./features/claims/claims-list.component').then((m) => m.ClaimsListComponent),
          },
          {
            path: 'nuevo',
            loadComponent: () =>
              import('./features/claims/declare-claim.component').then((m) => m.DeclareClaimComponent),
          },
          {
            path: 'tipos-de-siniestro',
            loadComponent: () =>
              import('./features/claims/claim-types.component').then((m) => m.ClaimTypesComponent),
          },
          {
            path: 'catalogos',
            loadComponent: () =>
              import('./features/catalogs/catalogs.component').then((m) => m.CatalogsComponent),
            data: {
              registry: CLAIMS_CATALOG_REGISTRY,
              pageTitle: 'claims.catalogsPageTitle',
              pageSubtitle: 'claims.catalogsPageSubtitle',
            },
          },
          {
            path: ':id',
            loadComponent: () =>
              import('./features/claims/claim-detail.component').then((m) => m.ClaimDetailComponent),
          },
        ],
      },
      {
        path: 'ubicaciones',
        loadComponent: () =>
          import('./features/locations/locations.component').then((m) => m.LocationsComponent),
      },
      {
        path: 'configuracion-menu',
        loadComponent: () =>
          import('./features/menu-config/menu-config.component').then((m) => m.MenuConfigComponent),
      },
      {
        path: 'comisiones',
        loadComponent: () =>
          import('./features/commissions/commissions.component').then((m) => m.CommissionsComponent),
      },
      {
        // "Flujos de proceso" -- ítem padre en el sidebar con 3 hijos,
        // mismo patrón que "Configuración de productos": Catálogos
        // (Pasos/Pantallas/Flujos, catálogos simples que reutilizan
        // `CatalogsComponent`), Pasos de flujo (`SFlowStep`) y
        // Asignación por producto (`SProductProcessFlow`, la pieza que
        // faltaba -- ver `product-process-flows.component.ts`). Pedido
        // explícito del usuario, 2026-09-23.
        path: 'flujos-de-proceso',
        children: [
          {
            path: 'catalogos',
            loadComponent: () =>
              import('./features/catalogs/catalogs.component').then((m) => m.CatalogsComponent),
            data: {
              registry: PROCESS_FLOW_CATALOG_REGISTRY,
              pageTitle: 'catalogs.processFlowsPageTitle',
              pageSubtitle: 'catalogs.processFlowsPageSubtitle',
            },
          },
          {
            path: 'pasos-de-flujo',
            loadComponent: () =>
              import('./features/process-flows/flow-steps.component').then((m) => m.FlowStepsComponent),
          },
          {
            path: 'asignacion-por-producto',
            loadComponent: () =>
              import('./features/process-flows/product-process-flows.component').then(
                (m) => m.ProductProcessFlowsComponent,
              ),
          },
        ],
      },
      {
        // "Configuración de productos" -- ítem padre en el sidebar (ver
        // packages/database/scripts/seed-menu-config.js) con 3 hijos:
        // Catálogos de producto, Productos y Tablas de tarifa. Antes
        // "Productos"/"Tarifas" eran ítems raíz separados y los 14
        // catálogos de producto vivían mezclados con los 9 comunes en
        // "Catálogos" -- decisión explícita del usuario, al notar que esa
        // pantalla única con 23 catálogos quedaba desorganizada.
        path: 'configuracion-productos',
        children: [
          {
            path: 'catalogos',
            loadComponent: () =>
              import('./features/catalogs/catalogs.component').then((m) => m.CatalogsComponent),
            data: {
              registry: PRODUCT_CATALOG_REGISTRY,
              pageTitle: 'catalogs.productsPageTitle',
              pageSubtitle: 'catalogs.productsPageSubtitle',
            },
          },
          {
            path: 'productos',
            loadComponent: () =>
              import('./features/products/products.component').then((m) => m.ProductsComponent),
          },
          {
            path: 'tarifas',
            loadComponent: () =>
              import('./features/rate-tables/rate-tables.component').then((m) => m.RateTablesComponent),
          },
          {
            // "Requisitos" (SProductRequirement) -- feature nueva
            // 2026-09-24, ver product-requirements.component.ts. El
            // catálogo simple SRequirement ya vive en 'catalogos' (se
            // agregó a PRODUCT_CATALOG_REGISTRY); acá solo la asignación
            // por producto, que es bespoke (sin código propio).
            path: 'requisitos',
            loadComponent: () =>
              import('./features/requirements/product-requirements.component').then(
                (m) => m.ProductRequirementsComponent,
              ),
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
