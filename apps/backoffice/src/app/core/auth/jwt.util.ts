import { JwtPayload } from './models';

/**
 * Decodifica el payload de un JWT sin validar la firma -- eso ya lo hace el
 * backend en cada request. Client-side solo lo usamos para leer claims
 * (rol, código de usuario) y mostrar la UI acorde (menú, header). Sin
 * dependencia nueva (`jwt-decode` u otra) -- es un base64url decode simple.
 */
export function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}
