/**
 * Vía de distribución (`SDistributionWay.CodDistributionWay`) con la que esta aplicacion genera cotizaciones y
 * contratos. La via identifica la APLICACION de origen (backoffice, API, area privada...), no la estructura
 * comercial, asi que no se elige: es fija para esta app. Debe existir en BD (`setup-distribution-way.js`).
 */
export const DISTRIBUTION_WAY_BACKOFFICE = 'BACKOFFICE';
