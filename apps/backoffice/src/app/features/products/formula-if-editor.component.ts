import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { CheckboxModule } from 'primeng/checkbox';
import { TranslocoPipe } from '@jsverse/transloco';
import { FormulaChainEditorComponent } from './formula-chain-editor.component';
import {
  Comparison,
  CompareOperator,
  IfModel,
  Joiner,
  SimpleOption,
  TermChain,
  emptyComparison,
} from './formula-builder.model';

const COMPARE_OPERATOR_OPTIONS: CompareOperator[] = ['=', '!=', '>', '>=', '<', '<='];
const JOINER_OPTIONS: Joiner[] = ['AND', 'OR'];

/**
 * Editor visual del `IF` de una `SCalculationRule` (backlog ítem 8) --
 * el pedido del usuario (2026-10-02) fue que la opción más común, "esta
 * regla siempre se aplica" (hoy escrita a mano como `TRUE`), tenga un
 * toggle propio en vez de obligar a entender que `TRUE` es una fórmula
 * válida. Cuando no es "siempre", se arma una lista de comparaciones
 * (cada lado es una `TermChain`, reutilizando `FormulaChainEditorComponent`)
 * unidas por AND/OR -- igual de simple que el `IfModel` que ya valida
 * `formula-builder.model.ts`.
 */
@Component({
  selector: 'app-formula-if-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, SelectModule, CheckboxModule, TranslocoPipe, FormulaChainEditorComponent],
  templateUrl: './formula-if-editor.component.html',
})
export class FormulaIfEditorComponent {
  readonly ifModel = input.required<IfModel>();
  readonly fieldTokenChoices = input.required<SimpleOption[]>();
  readonly ruleChoices = input.required<SimpleOption[]>();
  readonly adjustmentChoices = input.required<SimpleOption[]>();
  readonly rateTableChoices = input.required<SimpleOption[]>();
  readonly ifModelChange = output<IfModel>();

  readonly compareOperatorOptions = COMPARE_OPERATOR_OPTIONS;
  readonly joinerOptions = JOINER_OPTIONS;

  setAlways(always: boolean): void {
    const m = this.ifModel();
    this.ifModelChange.emit({
      ...m,
      mode: always ? 'always' : 'condition',
      comparisons: m.comparisons.length > 0 ? m.comparisons : [emptyComparison()],
    });
  }

  addComparison(): void {
    const m = this.ifModel();
    this.ifModelChange.emit({
      ...m,
      comparisons: [...m.comparisons, emptyComparison()],
      joiners: [...m.joiners, 'AND'],
    });
  }

  removeComparison(index: number): void {
    const m = this.ifModel();
    if (m.comparisons.length <= 1) return;
    const comparisons = m.comparisons.filter((_, i) => i !== index);
    const joinerIndexToRemove = index === 0 ? 0 : index - 1;
    const joiners = m.joiners.filter((_, i) => i !== joinerIndexToRemove);
    this.ifModelChange.emit({ ...m, comparisons, joiners });
  }

  setJoiner(index: number, joiner: Joiner): void {
    const m = this.ifModel();
    const joiners = [...m.joiners];
    joiners[index] = joiner;
    this.ifModelChange.emit({ ...m, joiners });
  }

  setOperator(index: number, op: CompareOperator): void {
    this.updateComparison(index, { op });
  }

  setLeft(index: number, left: TermChain): void {
    this.updateComparison(index, { left });
  }

  setRight(index: number, right: TermChain): void {
    this.updateComparison(index, { right });
  }

  private updateComparison(index: number, patch: Partial<Comparison>): void {
    const m = this.ifModel();
    const comparisons = [...m.comparisons];
    comparisons[index] = { ...comparisons[index], ...patch };
    this.ifModelChange.emit({ ...m, comparisons });
  }
}
