import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  ChainOperator,
  RateTableFactor,
  SimpleOption,
  Term,
  TermChain,
  TermKind,
  emptyChain,
  emptyFactors,
} from './formula-builder.model';

interface KindOption {
  value: TermKind;
  labelKey: string;
}

const KIND_OPTIONS: KindOption[] = [
  { value: 'number', labelKey: 'products.calculationRules.builder.kindNumber' },
  { value: 'field', labelKey: 'products.calculationRules.builder.kindField' },
  { value: 'rule', labelKey: 'products.calculationRules.builder.kindRule' },
  { value: 'adjustment', labelKey: 'products.calculationRules.builder.kindAdjustment' },
  { value: 'rateTable', labelKey: 'products.calculationRules.builder.kindRateTable' },
  { value: 'group', labelKey: 'products.calculationRules.builder.kindGroup' },
];

const CHAIN_OPERATOR_OPTIONS: ChainOperator[] = ['+', '-', '*', '/', '%', '^'];

/**
 * Editor visual de una `TermChain` (backlog ítem 8, ver docs/02-roadmap.md)
 * -- una lista de términos unidos por operadores aritméticos, donde un
 * término puede a su vez ser OTRA cadena entre paréntesis (`kind: 'group'`,
 * ver `./formula-builder.model.ts` para por qué hace falta: las 238
 * reglas reales de `PrimaTotal` usan paréntesis anidados). Por eso este
 * componente se importa A SÍ MISMO -- cada término "grupo" renderiza
 * otra instancia de `FormulaChainEditorComponent` adentro.
 *
 * Flujo de datos: `chain` entra como `input` (NO `model`) y cada cambio
 * sale por `chainChange` con la cadena COMPLETA ya reconstruida
 * (inmutable) -- se eligió este patrón de "evento hacia arriba" en vez
 * de `model()` de dos vías porque la cadena vive anidada dentro de
 * arrays/objetos de un `@for` (`chain().terms`), donde el two-way
 * binding de Angular a través de la variable del loop es frágil; así
 * queda explícito en cada nivel quién reconstruye qué.
 */
@Component({
  selector: 'app-formula-chain-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, SelectModule, InputTextModule, InputNumberModule, TranslocoPipe, FormulaChainEditorComponent],
  templateUrl: './formula-chain-editor.component.html',
})
export class FormulaChainEditorComponent {
  readonly chain = input.required<TermChain>();
  readonly fieldTokenChoices = input.required<SimpleOption[]>();
  readonly ruleChoices = input.required<SimpleOption[]>();
  readonly adjustmentChoices = input.required<SimpleOption[]>();
  readonly rateTableChoices = input.required<SimpleOption[]>();
  readonly chainChange = output<TermChain>();

  readonly kindOptions = KIND_OPTIONS;
  readonly chainOperatorOptions = CHAIN_OPERATOR_OPTIONS;

  addTerm(): void {
    const c = this.chain();
    this.chainChange.emit({ terms: [...c.terms, { kind: 'number', numberValue: 0 }], operators: [...c.operators, '+'] });
  }

  removeTerm(index: number): void {
    const c = this.chain();
    if (c.terms.length <= 1) return;
    const terms = c.terms.filter((_, i) => i !== index);
    const opIndexToRemove = index === 0 ? 0 : index - 1;
    const operators = c.operators.filter((_, i) => i !== opIndexToRemove);
    this.chainChange.emit({ terms, operators });
  }

  setOperator(opIndex: number, op: ChainOperator): void {
    const c = this.chain();
    const operators = [...c.operators];
    operators[opIndex] = op;
    this.chainChange.emit({ ...c, operators });
  }

  setTermKind(index: number, kind: TermKind): void {
    const c = this.chain();
    const terms = [...c.terms];
    terms[index] = this.buildDefaultTerm(kind);
    this.chainChange.emit({ ...c, terms });
  }

  updateTerm(index: number, patch: Partial<Term>): void {
    const c = this.chain();
    const terms = [...c.terms];
    terms[index] = { ...terms[index], ...patch };
    this.chainChange.emit({ ...c, terms });
  }

  onGroupChange(index: number, group: TermChain): void {
    this.updateTerm(index, { group });
  }

  updateFactor(index: number, factorIndex: number, fieldCode: string): void {
    const c = this.chain();
    const term = c.terms[index];
    const factors: RateTableFactor[] = [...(term.factors ?? emptyFactors())];
    factors[factorIndex] = { fieldCode: fieldCode || null };
    this.updateTerm(index, { factors });
  }

  factorValue(term: Term, index: number): string {
    return term.factors?.[index]?.fieldCode ?? '';
  }

  private buildDefaultTerm(kind: TermKind): Term {
    switch (kind) {
      case 'number':
        return { kind, numberValue: 0 };
      case 'field':
        return { kind, code: this.fieldTokenChoices()[0]?.code ?? '' };
      case 'rule':
        return { kind, code: this.ruleChoices()[0]?.code ?? '' };
      case 'adjustment':
        return { kind, code: this.adjustmentChoices()[0]?.code ?? '' };
      case 'rateTable':
        return { kind, rateTableCode: this.rateTableChoices()[0]?.code ?? '', factors: emptyFactors() };
      case 'group':
        return { kind, group: emptyChain() };
    }
  }
}
