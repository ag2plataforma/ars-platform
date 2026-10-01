import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  // `bodyParser: false` + registro manual de `express.json()` con un
  // límite más alto que el default de Express (100kb) -- el 413 que vio
  // el usuario al subir una plantilla .docx (ver DocumentTemplatesService/
  // main.ts de documents-service) pasaba en el GATEWAY, no en
  // documents-service: toda request del frontend entra primero acá, así
  // que el límite tiene que subirse en los dos lugares, no solo en el
  // servicio final. 15mb cubre con margen una plantilla Word típica
  // codificada en base64 (~33% más grande que el archivo original).
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '15mb' }));
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`gateway escuchando en el puerto ${port}`);
}

bootstrap();
