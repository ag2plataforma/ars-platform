import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SMS_SENDER } from './sms-sender.interface';
import { BrevoSmsSender } from './brevo-sms-sender.service';
import { TwilioSmsSender } from './twilio-sms-sender.service';
import { LogSmsSender } from './log-sms-sender.service';

/**
 * Elige el proveedor de SMS con `SMS_PROVIDER` (`twilio` | `brevo` | `log`). Si no
 * está definida: Twilio cuando hay `TWILIO_ACCOUNT_SID`, y Brevo en caso
 * contrario.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    BrevoSmsSender,
    TwilioSmsSender,
    LogSmsSender,
    {
      provide: SMS_SENDER,
      inject: [ConfigService, BrevoSmsSender, TwilioSmsSender, LogSmsSender],
      useFactory: (config: ConfigService, brevo: BrevoSmsSender, twilio: TwilioSmsSender, log: LogSmsSender) => {
        const explicit = (config.get<string>('SMS_PROVIDER') ?? '').trim().toLowerCase();
        const provider = explicit || (config.get<string>('TWILIO_ACCOUNT_SID') ? 'twilio' : 'brevo');
        const senders = { twilio, brevo, log } as const;
        if (!(provider in senders)) {
          throw new Error(`SMS_PROVIDER="${explicit}" no es válido (usar "twilio", "brevo" o "log")`);
        }
        new Logger('SmsModule').log(`Proveedor de SMS: ${provider}`);
        return senders[provider as keyof typeof senders];
      },
    },
  ],
  exports: [SMS_SENDER],
})
export class SmsModule {}
