import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface RoleOption {
  IdeRol: string;
  CodRol: string;
  DesRol: string;
}

export interface UserRow {
  IdeUser: string;
  CodUser: string;
  UserName: string;
  TRol: { CodRol: string; DesRol: string };
  SState: { CodState: string; DesState: string };
}

export interface UserListResponse {
  items: UserRow[];
  total: number;
  page: number;
  limit: number;
}

export interface ListUsersParams {
  codRol?: string;
  page: number;
  limit: number;
}

export interface CreateUserPayload {
  codUser: string;
  userName: string;
  password: string;
  codRol: string;
}

export interface UpdateUserPayload {
  userName?: string;
  codRol?: string;
}

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly base = `${environment.apiUrl}/iam/users`;
  private readonly rolesBase = `${environment.apiUrl}/iam/roles`;

  constructor(private readonly http: HttpClient) {}

  list(params: ListUsersParams): Observable<UserListResponse> {
    let httpParams = new HttpParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        httpParams = httpParams.set(key, String(value));
      }
    }
    return this.http.get<UserListResponse>(this.base, { params: httpParams });
  }

  create(payload: CreateUserPayload): Observable<UserRow> {
    return this.http.post<UserRow>(this.base, payload);
  }

  update(ideUser: string, payload: UpdateUserPayload): Observable<UserRow> {
    return this.http.patch<UserRow>(`${this.base}/${ideUser}`, payload);
  }

  setState(ideUser: string, codState: string): Observable<UserRow> {
    return this.http.patch<UserRow>(`${this.base}/${ideUser}/state`, { codState });
  }

  listRoles(): Observable<RoleOption[]> {
    return this.http.get<RoleOption[]>(this.rolesBase);
  }
}
