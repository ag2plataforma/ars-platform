import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  // `bodyParser: false` + registro manual de `express.json()` con un
  // límite más alto que el default de Express (100kb) -- las plantillas
  // .docx viajan como base64 dentro del JSON (ver TemplatesService) para
  // que el proxy del gateway (hoy solo reenvía bodies JSON, sin soportar
  // multipart/form-data) pueda pasarlas tal cual sin tocar `ProxyService`.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '15mb' }));
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  const port = process.env.PORT ?? 3009;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`documents-service escuchando en el puerto ${port}`);
}

bootstrap();
