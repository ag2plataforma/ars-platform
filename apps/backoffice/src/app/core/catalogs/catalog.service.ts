import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CatalogRow } from './catalog.model';

/** Cliente HTTP genérico contra cualquier catálogo con el shape de
 * `CatalogCrudService` del backend: `GET`, `GET /:id`, `POST`, `PATCH /:id`,
 * `PATCH /:id/state`. `path` ya incluye el prefijo del gateway (ej.
 * `/reference-data/genders`). También sirve para `SLocation`
 * (`locations.service.ts`, escrito a mano en el backend), que no sigue el
 * shape de `CatalogCrudService` pero sí el mismo verbo/forma HTTP -- por
 * eso `list` acepta query params opcionales (`codCountry`,
 * `codLocationParent`). */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  constructor(private readonly http: HttpClient) {}

  list(path: string, params?: Record<string, string>): Observable<CatalogRow[]> {
    let httpParams = new HttpParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      httpParams = httpParams.set(key, value);
    }
    return this.http.get<CatalogRow[]>(`${environment.apiUrl}${path}`, { params: httpParams });
  }

  create(path: string, body: Record<string, unknown>): Observable<CatalogRow> {
    return this.http.post<CatalogRow>(`${environment.apiUrl}${path}`, body);
  }

  update(path: string, id: string, body: Record<string, unknown>): Observable<CatalogRow> {
    return this.http.patch<CatalogRow>(`${environment.apiUrl}${path}/${id}`, body);
  }

  setState(path: string, id: string, codState: string): Observable<CatalogRow> {
    return this.http.patch<CatalogRow>(`${environment.apiUrl}${path}/${id}/state`, { codState });
  }
}
