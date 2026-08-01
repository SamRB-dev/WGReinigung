type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type FcmData = Record<string, string>;

export class FcmError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function base64Url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function serviceAccount(): ServiceAccount {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON');
  if (!raw) throw new Error('Missing FCM_SERVICE_ACCOUNT_JSON secret.');
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) throw new Error('Incomplete service account JSON.');
    return parsed;
  } catch (error) {
    throw new Error(`Invalid FCM_SERVICE_ACCOUNT_JSON: ${String(error)}`);
  }
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const normalized = pem.replace(/\\n/g, '\n');
  const der = Uint8Array.from(
    atob(normalized.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\s/g, '')),
    char => char.charCodeAt(0),
  );
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

async function getAccessToken(): Promise<{ token: string; projectId: string }> {
  const account = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60) {
    return { token: cachedAccessToken.token, projectId: account.project_id };
  }

  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: account.token_uri ?? 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const key = await importPrivateKey(account.private_key);
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)));
  const assertion = `${unsigned}.${base64Url(signature)}`;

  const response = await fetch(account.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description ?? payload.error ?? 'Could not obtain FCM access token.');

  cachedAccessToken = { token: payload.access_token, expiresAt: now + Number(payload.expires_in ?? 3600) };
  return { token: payload.access_token, projectId: account.project_id };
}

export async function sendFcmMessage(args: {
  token: string;
  title: string;
  body: string;
  data?: FcmData;
}): Promise<string> {
  const auth = await getAccessToken();
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${auth.projectId}/messages:send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token: args.token,
        notification: { title: args.title, body: args.body },
        data: args.data ?? {},
        android: {
          priority: 'HIGH',
          notification: {
            channel_id: 'cleaning-reminders',
            sound: 'default',
            default_vibrate_timings: true,
          },
        },
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(payload?.error?.details)
      ? payload.error.details.find((item: Record<string, unknown>) => typeof item?.errorCode === 'string')
      : undefined;
    throw new FcmError(
      payload?.error?.message ?? 'FCM request failed.',
      detail?.errorCode as string | undefined,
      response.status,
    );
  }
  return String(payload.name ?? 'sent');
}

export function isInvalidFcmToken(error: unknown): boolean {
  return error instanceof FcmError && ['UNREGISTERED', 'INVALID_ARGUMENT', 'SENDER_ID_MISMATCH'].includes(error.code ?? '');
}
