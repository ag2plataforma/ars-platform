# billing-service (pendiente de scaffolding)

Sustituye a: `ag2paymentgateway` + la lógica de recibos hoy repartida entre `FReceipt`, `FReceipt_GetNumber` y `FMovementConcept`.

Alcance: recibos (`TReceipt`, `TReceiptDetail`), periodos de facturación (`TContractBilling`), y el cálculo de comisiones por árbol de canal (`SCommissionTree`/`SCommissionTable`/`SCommission`) hoy dentro de `FReceipt`.

Se scaffoldeará siguiendo exactamente la misma estructura que `services/iam-service` cuando toque su turno.
