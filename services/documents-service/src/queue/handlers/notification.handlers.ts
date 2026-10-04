import { Injectable } from '@nestjs/common';
import type { QueuedTask } from '@ars-platform/database';
import { NotificationResult, NotificationsService } from '../../notifications/notifications.service';
import { PermanentTaskError, TaskHandler } from '../task-handler';

export const WELCOME_SMS_TASK = 'WELCOME_SMS';
export const RENEWAL_NOTICE_EMAIL_TASK = 'RENEWAL_NOTICE_EMAIL';
export const RENEWAL_NOTICE_SMS_TASK = 'RENEWAL_NOTICE_SMS';

function contractOf(task: QueuedTask): string {
  if (!task.ideEntity) throw new PermanentTaskError('La tarea no tiene contrato asociado');
  return task.ideEntity;
}

const toResult = (r: NotificationResult): Record<string, unknown> => ({ ...r });

/** SMS de bienvenida al activar un contrato (encolado por `ContractsService.activate()`). */
@Injectable()
export class WelcomeSmsHandler implements TaskHandler {
  readonly codTaskType = WELCOME_SMS_TASK;
  constructor(private readonly notifications: NotificationsService) {}
  async handle(task: QueuedTask) {
    return toResult(await this.notifications.sendWelcomeSms(contractOf(task)));
  }
}

/** Aviso de renovación por correo (encolado por el job programado AVISO_RENOVACION). */
@Injectable()
export class RenewalNoticeEmailHandler implements TaskHandler {
  readonly codTaskType = RENEWAL_NOTICE_EMAIL_TASK;
  constructor(private readonly notifications: NotificationsService) {}
  async handle(task: QueuedTask) {
    return toResult(await this.notifications.sendRenewalNoticeEmail(contractOf(task)));
  }
}

/** Aviso de renovación por SMS (encolado por el job programado AVISO_RENOVACION). */
@Injectable()
export class RenewalNoticeSmsHandler implements TaskHandler {
  readonly codTaskType = RENEWAL_NOTICE_SMS_TASK;
  constructor(private readonly notifications: NotificationsService) {}
  async handle(task: QueuedTask) {
    return toResult(await this.notifications.sendRenewalNoticeSms(contractOf(task)));
  }
}
