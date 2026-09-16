import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@ars-platform/database';
import { StateMachineService } from '@ars-platform/shared-common';
import { hash } from 'bcryptjs';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ListUsersDto } from './dto/list-users.dto';

/**
 * CRUD de `TUser`/`TRol`. No hace borrado físico — el "desactivar" un
 * usuario es una transición de estado (`PATCH /users/:id/state`), como el
 * resto del sistema (ver `SState`/`SStateRule`). No asume qué códigos de
 * estado existen más allá de "ACTIVO" (usado al crear): cualquier otro
 * (INACTIVO, SUSPENDIDO, etc.) se valida en caliente contra el catálogo
 * real vía `StateMachineService.getStateByCode`, no hardcodeado aquí.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
  ) {}

  async create(dto: CreateUserDto, actor: string) {
    const existingByCode = await this.prisma.tUser.findUnique({
      where: { CodUser: dto.codUser },
    });
    if (existingByCode) {
      throw new ConflictException(`Ya existe un usuario con codUser "${dto.codUser}"`);
    }
    const existingByUserName = await this.prisma.tUser.findFirst({
      where: { UserName: dto.userName },
    });
    if (existingByUserName) {
      throw new ConflictException(`Ya existe un usuario con userName "${dto.userName}"`);
    }

    const rol = await this.prisma.tRol.findUnique({ where: { CodRol: dto.codRol } });
    if (!rol) {
      throw new NotFoundException(`No existe el rol "${dto.codRol}"`);
    }

    const activeStateId = await this.stateMachine.getStateByCode('ACTIVO');
    const now = new Date();

    const user = await this.prisma.tUser.create({
      data: {
        CodUser: dto.codUser,
        UserName: dto.userName,
        IdeRol: rol.IdeRol,
        IdeState: activeStateId,
        UserData: (dto.userData ?? {}) as Prisma.InputJsonValue,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
      include: { TRol: true, SState: true },
    });

    const hashed = await hash(dto.password, 10);
    await this.prisma.tUserCredential.create({
      data: {
        IdeUser: user.IdeUser,
        Credential: hashed,
        IdeState: activeStateId,
        UsrCreation: actor,
        TstCreation: now,
        UsrModification: actor,
        TstModification: now,
      },
    });

    return user;
  }

  async findAll(query: ListUsersDto) {
    const where = query.codRol ? { TRol: { CodRol: query.codRol } } : {};
    const [items, total] = await Promise.all([
      this.prisma.tUser.findMany({
        where,
        include: { TRol: true, SState: true },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { TstCreation: 'desc' },
      }),
      this.prisma.tUser.count({ where }),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }

  async findOne(id: string) {
    const user = await this.prisma.tUser.findUnique({
      where: { IdeUser: id },
      include: { TRol: true, SState: true },
    });
    if (!user) {
      throw new NotFoundException(`No existe el usuario "${id}"`);
    }
    return user;
  }

  async update(id: string, dto: UpdateUserDto, actor: string) {
    await this.findOne(id);

    let ideRol: string | undefined;
    if (dto.codRol) {
      const rol = await this.prisma.tRol.findUnique({ where: { CodRol: dto.codRol } });
      if (!rol) {
        throw new NotFoundException(`No existe el rol "${dto.codRol}"`);
      }
      ideRol = rol.IdeRol;
    }

    // Se construye imperativamente (no con spreads condicionales en un solo
    // literal) porque Prisma tipa `data` como XOR entre la variante
    // "checked" (relaciones vía connect) y la "unchecked" (FKs escalares
    // directas, la que usamos aquí) — un literal con spreads condicionales
    // hace que TS no pueda decidir a cuál de las dos variantes pertenece.
    const data: Prisma.TUserUncheckedUpdateInput = {
      UsrModification: actor,
      TstModification: new Date(),
    };
    if (dto.userName) {
      data.UserName = dto.userName;
    }
    if (ideRol) {
      data.IdeRol = ideRol;
    }
    if (dto.userData) {
      data.UserData = dto.userData as Prisma.InputJsonValue;
    }

    return this.prisma.tUser.update({
      where: { IdeUser: id },
      data,
      include: { TRol: true, SState: true },
    });
  }

  async setState(id: string, codState: string, actor: string) {
    await this.findOne(id);
    const stateId = await this.stateMachine.getStateByCode(codState);
    return this.prisma.tUser.update({
      where: { IdeUser: id },
      data: { IdeState: stateId, UsrModification: actor, TstModification: new Date() },
      include: { TRol: true, SState: true },
    });
  }
}
