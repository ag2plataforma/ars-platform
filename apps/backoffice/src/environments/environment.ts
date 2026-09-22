// `appVersion` se actualiza a mano junto con `version` en package.json --
// no hay paso de build que lo lea automáticamente todavía (proyecto chico,
// sin CI; se puede automatizar más adelante si hace falta).
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
  appVersion: '0.1.0',
};
