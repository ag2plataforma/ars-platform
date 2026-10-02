import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ChartModule } from 'primeng/chart';
import { AuthService } from '../../core/auth/auth.service';
import { QuotingService, QuoteStats, QuoteStatsByState } from '../quotes/quoting.service';
import { ContractsService, PortfolioStats } from '../contracts/contracts.service';
import { ClaimsApiService, ClaimStats } from '../claims/claims.service';

/** Estados de `TClaimFile` que se consideran "cerrados" para el conteo de
 * "Siniestros pendientes" (ver `seed-claims-approval-workflow.js`: los
 * únicos estados reales son DECLARADO, EN_REVISION_REQUISITOS,
 * EN_EVALUACION, APROBADO, RECHAZADO, PAGADO, CERRADO, REABIERTO --
 * "pendiente" = cualquiera que no sea uno de estos tres). */
const CLOSED_CLAIM_FILE_STATES = ['CERRADO', 'RECHAZADO', 'PAGADO'];

/** Qué rol de `TRol` (`AuthService.payload()?.role`) ve cada sección --
 * pedido explícito del usuario (2026-10-02): "me gustaría que los
 * widgets/gráficos dependieran del rol del usuario". ADMIN ve las tres,
 * cada rol de negocio ve solo la suya. */
const COMERCIAL_ROLES = ['ADMIN', 'SALES'];
const CARTERA_ROLES = ['ADMIN', 'PORTFOLIO'];
const SINIESTRALIDAD_ROLES = ['ADMIN', 'CLAIMS_ADJUSTER', 'CLAIMS_MANAGER', 'CLAIMS_DIRECTOR'];

/** Un tono fijo por sección, reutilizado en todos sus gráficos. En un
 * gráfico de una sola serie (línea de evolución, barras por estado) el
 * color no es quien lleva la identidad de la categoría -- lo hace la
 * etiqueta del eje/leyenda -- así que alcanza un único tono por sección
 * en vez de armar una paleta categórica completa (ver skill de dataviz).
 * `COLOR_COMERCIAL` es el mismo brand-600 que ya usan los íconos de las
 * tarjetas KPI existentes (`text-brand-600`), para no introducir un tono
 * nuevo encima del color de marca real. */
const COLOR_COMERCIAL = '#534D9E';
const COLOR_CARTERA = '#0D9488';
const COLOR_SINIESTROS = '#D97706';

interface BarChartData {
  labels: string[];
  datasets: { data: number[]; backgroundColor: string; borderRadius: number; barThickness: number }[];
}

/**
 * Dashboard de inicio -- rediseño pedido explícitamente por el usuario
 * (2026-10-02, ver docs/02-roadmap.md: "Gráficos en el dashboard de
 * inicio") para que sea "más llamativo, con más indicadores/widgets y
 * gráficos" y, sobre todo, dependiente del rol del usuario logueado:
 * ADMIN ve las tres secciones (Comercial/Cartera/Siniestralidad), cada
 * rol de negocio nuevo (`SALES`/`PORTFOLIO`, ver `seed-dashboard-roles.js`)
 * ve solo la suya, y los roles de Siniestros (`CLAIMS_*`) ven solo
 * Siniestralidad.
 *
 * Cada sección se alimenta de su propio endpoint de estadísticas ya
 * existente (`QuotesService.getStats`/`ContractsService.getPortfolioStats`/
 * `ClaimsService.getStats`, agregados junto con esta pantalla) -- se
 * dispara SOLO la llamada de la(s) sección(es) que el usuario puede ver,
 * no las tres siempre, para no pedirle al backend datos que no se van a
 * mostrar. Los gráficos usan `p-chart` (PrimeNG sobre Chart.js, recién
 * instalado -- ver `package.json`).
 *
 * Varios valores se derivan sin pedir nada extra al backend: "Cotizaciones
 * del mes" sale del último mes de `QuoteStats.monthly` (el array ya viene
 * con el mes actual incluido al final), "Contratos activos" y "Siniestros
 * pendientes" se derivan sumando/filtrando `byState` del lado del
 * cliente -- mismo criterio que ya usaba este componente antes de este
 * rediseño para "Siniestros pendientes".
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, TranslocoPipe, ChartModule],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly quotingService = inject(QuotingService);
  private readonly contractsService = inject(ContractsService);
  private readonly claimsService = inject(ClaimsApiService);
  private readonly transloco = inject(TranslocoService);

  readonly userCode = computed(() => this.auth.payload()?.code ?? '');
  private readonly role = computed(() => this.auth.payload()?.role ?? '');

  readonly showComercial = computed(() => COMERCIAL_ROLES.includes(this.role()));
  readonly showCartera = computed(() => CARTERA_ROLES.includes(this.role()));
  readonly showSiniestralidad = computed(() => SINIESTRALIDAD_ROLES.includes(this.role()));
  readonly noSections = computed(() => !this.showComercial() && !this.showCartera() && !this.showSiniestralidad());

  readonly loadingComercial = signal(true);
  readonly loadingCartera = signal(true);
  readonly loadingSiniestralidad = signal(true);

  private readonly quoteStats = signal<QuoteStats | null>(null);
  private readonly portfolioStats = signal<PortfolioStats | null>(null);
  private readonly claimStats = signal<ClaimStats | null>(null);

  readonly quotesThisMonth = computed(() => {
    const monthly = this.quoteStats()?.monthly ?? [];
    return monthly.length > 0 ? monthly[monthly.length - 1].count : null;
  });

  readonly conversionRatePct = computed(() => {
    const stats = this.quoteStats();
    if (!stats) return null;
    return Math.round(stats.conversionRate * 1000) / 10;
  });

  readonly activeContracts = computed(
    () => this.portfolioStats()?.byState.find((s) => s.codState === 'ACTIVO')?.count ?? 0,
  );

  readonly totalPrimeInForce = computed(() => this.portfolioStats()?.totalPrimeInForce ?? null);
  readonly renewalsUpcoming = computed(() => this.portfolioStats()?.renewalsUpcoming ?? null);

  readonly pendingClaims = computed(() => {
    const byState = this.claimStats()?.byState;
    if (!byState) return null;
    return byState.filter((s) => !CLOSED_CLAIM_FILE_STATES.includes(s.codState)).reduce((sum, s) => sum + s.count, 0);
  });

  readonly indemnifiedThisMonth = computed(() => this.claimStats()?.indemnifiedThisMonth ?? null);

  readonly quotesEvolutionChart = computed(() => {
    const monthly = this.quoteStats()?.monthly ?? [];
    return {
      labels: monthly.map((m) => m.month),
      datasets: [
        {
          label: this.transloco.translate<string>('dashboard.comercial.monthlySeries'),
          data: monthly.map((m) => m.count),
          borderColor: COLOR_COMERCIAL,
          backgroundColor: 'rgba(83, 77, 158, 0.15)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: COLOR_COMERCIAL,
        },
      ],
    };
  });

  readonly quotesByStateChart = computed(() => this.buildStateBarChart(this.quoteStats()?.byState, COLOR_COMERCIAL));
  readonly contractsByStateChart = computed(() =>
    this.buildStateBarChart(this.portfolioStats()?.byState, COLOR_CARTERA),
  );
  readonly claimsByStateChart = computed(() => this.buildStateBarChart(this.claimStats()?.byState, COLOR_SINIESTROS));

  readonly barChartOptions = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(100, 116, 139, 0.1)' } },
      y: { grid: { display: false } },
    },
  };

  readonly lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(100, 116, 139, 0.1)' } },
      x: { grid: { display: false } },
    },
  };

  constructor() {
    if (this.showComercial()) {
      this.loadingComercial.set(true);
      this.quotingService.getStats().subscribe({
        next: (stats) => {
          this.quoteStats.set(stats);
          this.loadingComercial.set(false);
        },
        error: () => this.loadingComercial.set(false),
      });
    } else {
      this.loadingComercial.set(false);
    }

    if (this.showCartera()) {
      this.loadingCartera.set(true);
      this.contractsService.getPortfolioStats().subscribe({
        next: (stats) => {
          this.portfolioStats.set(stats);
          this.loadingCartera.set(false);
        },
        error: () => this.loadingCartera.set(false),
      });
    } else {
      this.loadingCartera.set(false);
    }

    if (this.showSiniestralidad()) {
      this.loadingSiniestralidad.set(true);
      this.claimsService.getStats().subscribe({
        next: (stats) => {
          this.claimStats.set(stats);
          this.loadingSiniestralidad.set(false);
        },
        error: () => this.loadingSiniestralidad.set(false),
      });
    } else {
      this.loadingSiniestralidad.set(false);
    }
  }

  private buildStateBarChart(byState: QuoteStatsByState[] | undefined, color: string): BarChartData {
    const rows = byState ?? [];
    return {
      labels: rows.map((r) => r.desState),
      datasets: [{ data: rows.map((r) => r.count), backgroundColor: color, borderRadius: 4, barThickness: 18 }],
    };
  }

  goTo(route: string): void {
    this.router.navigateByUrl(route);
  }
}
