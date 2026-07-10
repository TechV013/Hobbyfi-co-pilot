interface NotificationPayload {
  userIds: string[];
  type: string;
  message: string;
  vendorId: string;
}

export interface NotificationService {
  send(payload: NotificationPayload): Promise<void>;
}

export class ConsoleNotificationService implements NotificationService {
  async send(payload: NotificationPayload): Promise<void> {
    const { vendorId, userIds, type, message } = payload;
    console.log(`[NOTIFICATION] vendor=${vendorId} type=${type} users=[${userIds.join(",")}] message="${message}"`);
  }
}
