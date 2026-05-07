import { Op } from 'sequelize';
import { getFirebaseMessaging } from '../config/firebaseAdmin';
import { DevicePushToken } from '../models/DevicePushToken';

const INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
  'messaging/unregistered',
]);

function isInvalidTokenError(code?: string): boolean {
  return !!code && INVALID_TOKEN_CODES.has(code);
}

/**
 * Sends FCM with both `notification` (system UI) and `data` (routing; all string values).
 */
export async function sendEventReminderPush(params: {
  userId: string;
  eventId: string;
  title: string;
}): Promise<void> {
  const messaging = getFirebaseMessaging();
  if (!messaging) {
    console.warn('[fcm] Firebase Admin not configured; reminder not sent');
    return;
  }

  const rows = await DevicePushToken.findAll({ where: { userId: params.userId } });
  const tokens = rows.map((r) => r.token).filter(Boolean);
  if (!tokens.length) {
    return;
  }

  const invalidTokens: string[] = [];
  const chunkSize = 500;

  for (let i = 0; i < tokens.length; i += chunkSize) {
    const chunk = tokens.slice(i, i + chunkSize);
    const response = await messaging.sendEachForMulticast({
      tokens: chunk,
      notification: {
        title: 'Event reminder',
        body: `${params.title} starts in 10 minutes`,
      },
      data: {
        eventId: params.eventId,
        type: 'EVENT_REMINDER',
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'event_reminders',
          sound: 'default',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            contentAvailable: true,
          },
        },
      },
    });

    response.responses.forEach((r, idx) => {
      if (!r.success && isInvalidTokenError(r.error?.code)) {
        invalidTokens.push(chunk[idx]);
      }
    });
  }

  if (invalidTokens.length > 0) {
    await DevicePushToken.destroy({
      where: { token: { [Op.in]: invalidTokens } },
    });
  }
}
