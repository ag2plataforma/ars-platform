import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca un endpoint (o un controller completo) como accesible sin token.
 * Por defecto TODAS las rutas requieren un Bearer token válido —
 * ver `JwtAuthGuard`, registrado como guard global vía `AuthModule`.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
