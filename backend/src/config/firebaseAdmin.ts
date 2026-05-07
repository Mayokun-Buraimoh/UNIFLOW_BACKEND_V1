import * as admin from 'firebase-admin';

let initialized = false;

/**
 * Uses one of:
 * - FIREBASE_SERVICE_ACCOUNT_JSON — raw JSON string of the service account
 * - GOOGLE_APPLICATION_CREDENTIALS — path to service account JSON (Firebase Admin default)
 */
export function getFirebaseMessaging(): admin.messaging.Messaging | null {
  if (process.env.DISABLE_FCM === 'true') {
    return null;
  }

  if (!initialized && !admin.apps.length) {
    const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (json) {
      let cred: admin.ServiceAccount;
      try {
        cred = JSON.parse(json) as admin.ServiceAccount;
      } catch {
        console.error('[firebase] FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON');
        return null;
      }
      admin.initializeApp({
        credential: admin.credential.cert(cred),
      });
      initialized = true;
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
      initialized = true;
    } else {
      try {
        admin.initializeApp();
        initialized = true;
      } catch {
        return null;
      }
    }
  }

  if (!admin.apps.length) {
    return null;
  }

  return admin.messaging();
}
