import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CatalogRow } from './catalog.model';

/** Cliente HTTP genérico contra cualquier catálogo con el shape de
 * `CatalogCrudService` del backend: `GET`, `GET /:id`, `POST`, `PATCH /:id`,
 * `PATCH /:id/state`. `path` ya incluye el prefijo del gateway (ej.
 * `/reference-data/genders`). */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  constructor(private readonly http: HttpClient) {}

  list(path: string): Observable<CatalogRow[]> {
    return this.http.get<CatalogRow[]>(`${environment.apiUrl}${path}`);
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
