import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiUrl}/documents`;

export interface ProductOption {
  IdeProduct: string;
  DesProduct: string;
}

export interface OperationProductOption {
  ideOperationProduct: string;
  codOperation: string;
  desOperation: string;
}

export interface PersonRoleOption {
  idePersonRol: string;
  codPersonRol: string;
  desPersonRol: string;
}

export interface DocumentTemplate {
  ideOperationProductTemplate: string;
  codTemplateType: string;
  desFileName: string;
  idePersonRol: string;
  desPersonRol: string;
  numOrder: number;
  hasFile: boolean;
}

export interface CreateTemplatePayload {
  ideOperationProduct: string;
  codTemplateType: string;
  idePersonRol: string;
  numOrder: number;
  fileName: string;
  fileBase64: string;
}

export interface ReplaceTemplateFilePayload {
  fileName: string;
  fileBase64: string;
}

/**
 * Cliente del nuevo `documents-service` ("Gestión de plantillas de
 * documentos físicos", docs/02-roadmap.md item 5). El archivo .docx
 * viaja en base64 dentro del JSON -- no multipart -- a propósito: el
 * proxy del gateway hoy solo reenvía bodies JSON (ver
 * `services/gateway/src/proxy/proxy.service.ts`), así evitamos tocar esa
 * pieza compartida para esta primera versión.
 */
@Injectable({ providedIn: 'root' })
export class DocumentTemplatesService {
  constructor(private readonly http: HttpClient) {}

  listProducts(): Observable<ProductOption[]> {
    return this.http.get<ProductOption[]>(`${environment.apiUrl}/product-rating/products`);
  }

  listOperationProducts(ideProduct: string): Observable<OperationProductOption[]> {
    return this.http.get<OperationProductOption[]>(`${BASE}/operation-products`, { params: { ideProduct } });
  }

  listPersonRoles(): Observable<PersonRoleOption[]> {
    return this.http.get<PersonRoleOption[]>(`${BASE}/person-roles`);
  }

  listTemplates(ideOperationProduct: string): Observable<DocumentTemplate[]> {
    return this.http.get<DocumentTemplate[]>(`${BASE}/templates`, { params: { ideOperationProduct } });
  }

  createTemplate(payload: CreateTemplatePayload): Observable<{ ideOperationProductTemplate: string }> {
    return this.http.post<{ ideOperationProductTemplate: string }>(`${BASE}/templates`, payload);
  }

  replaceTemplateFile(
    ideOperationProductTemplate: string,
    payload: ReplaceTemplateFilePayload,
  ): Observable<{ ideOperationProductTemplate: string }> {
    return this.http.patch<{ ideOperationProductTemplate: string }>(
      `${BASE}/templates/${ideOperationProductTemplate}/file`,
      payload,
    );
  }
}

/** Convierte un `File` elegido por el usuario a base64 (sin el prefijo
 *  `data:...;base64,`) -- usado por el diálogo "Subir plantilla". */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
