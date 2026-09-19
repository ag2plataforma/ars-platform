import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Mismo shape que `MenuNode` en `reference-data-service` (`FGetSiteMap` real). */
export interface MenuNode {
  Titulo: string;
  Referencia: string | null;
  Orden: number;
  Imagen: string | null;
  Nivel: number;
  Submenu?: MenuNode[];
}

@Injectable({ providedIn: 'root' })
export class SiteMapService {
  constructor(private readonly http: HttpClient) {}

  /** `codApplicationRole` es el `CodRol` del usuario logueado (ver JwtPayload.role). */
  getMenu(codApplicationRole: string): Observable<MenuNode[]> {
    return this.http.get<MenuNode[]>(`${environment.apiUrl}/reference-data/site-map-menu`, {
      params: { codApplicationRole },
    });
  }
}
