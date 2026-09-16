import { Module } from '@nestjs/common';
import { join } from 'path';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@ars-platform/database';
import { AuthModule, EmailModule } from '@ars-platform/shared-common';
import { HealthController } from './health/health.controller';
import { IamStateMachineModule } from './state-machine/iam-state-machine.module';
import { IamAuthModule } from './auth/iam-auth.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Ruta absoluta a partir de __dirname (no relativa al cwd del
      // proceso): `start:iam` corre `node services/iam-service/dist/main.js`
      // desde la raíz del repo, no desde este directorio, así que un
      // `envFilePath: '.env'` relativo busca (y no encuentra) un .env en
      // la raíz del repo en vez del real, junto a este servicio.
      envFilePath: join(__dirname, '..', '.env'),
    }),
    PrismaModule,
    AuthModule, // guard JWT + roles global — ver @Public()/@Roles()
    EmailModule, // EMAIL_SENDER (Brevo) — usado por AuthService para recuperar contraseña
    IamAuthModule, // POST /auth/login, change-password, forgot/reset-password
    IamStateMachineModule,
    UsersModule, // CRUD de TUser/TRol
    // TODO (Fase 2): doble factor de autenticación, FGetSiteMap.
  ],
  controllers: [HealthController],
})
export class AppModule {}
