import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EMAIL_SENDER } from './email-sender.interface';
import { BrevoEmailSender } from './brevo-email-sender.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [{ provide: EMAIL_SENDER, useClass: BrevoEmailSender }],
  exports: [EMAIL_SENDER],
})
export class EmailModule {}
