import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  // `bodyParser: false` + registro manual de `express.json()` con un
  // límite más alto que el default de Express (100kb) -- mismo 413 que
  // ya se vio con la subida de plantillas .docx (ver main.ts de
  // documents-service y de gateway): los archivos de "Requisitos"
  // (Etapa 2) viajan como base64 dentro del JSON y superan el default.
  // El gateway ya tiene este mismo límite (15mb); hay que replicarlo acá
  // porque cada microservicio valida/parsea el body de forma
  // independiente, el límite del gateway no alcanza por sí solo.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '15mb' }));
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  const port = process.env.PORT ?? 3005;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`underwriting-service escuchando en el puerto ${port}`);
}

bootstrap();
