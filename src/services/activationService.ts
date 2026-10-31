export interface ActivationRecord {
  activationId: string;
  serviceUrl: string;
  isActive: boolean;
  activatedAt: string;
  assistantName: string;
}

const STORAGE_KEY = 'osa_custom_activation_service_v1';
const DEFAULT_ACTIVATION_ID = 'fc66e5808daf4a9f80b2499420c20424';
const DEFAULT_SERVICE_URL = 'https://activationservice.services/';

export function getStoredActivation(): ActivationRecord {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const defaultRecord: ActivationRecord = {
        activationId: DEFAULT_ACTIVATION_ID,
        serviceUrl: DEFAULT_SERVICE_URL,
        isActive: true,
        activatedAt: new Date().toISOString(),
        assistantName: 'OSA Voice & Direct Assistant',
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultRecord));
      return defaultRecord;
    }
    return JSON.parse(raw);
  } catch {
    return {
      activationId: DEFAULT_ACTIVATION_ID,
      serviceUrl: DEFAULT_SERVICE_URL,
      isActive: true,
      activatedAt: new Date().toISOString(),
      assistantName: 'OSA Voice & Direct Assistant',
    };
  }
}

export function saveActivation(record: ActivationRecord): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {}
}

export function clearActivation(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export async function verifyAndActivateService(urlOrId: string): Promise<ActivationRecord> {
  const cleanInput = urlOrId.trim();
  let id = cleanInput;
  let serviceUrl = cleanInput;

  if (cleanInput.includes('?id=')) {
    const parts = cleanInput.split('?id=');
    serviceUrl = parts[0];
    id = parts[1]?.split('&')[0] || '';
  } else if (cleanInput.startsWith('http')) {
    try {
      const u = new URL(cleanInput);
      serviceUrl = u.origin + u.pathname;
      const qId = u.searchParams.get('id');
      if (qId) id = qId;
    } catch {}
  }

  if (!id) {
    throw new Error('Invalid activation ID or service URL provided.');
  }

  const record: ActivationRecord = {
    activationId: id,
    serviceUrl: serviceUrl.startsWith('http') ? serviceUrl : DEFAULT_SERVICE_URL,
    isActive: true,
    activatedAt: new Date().toISOString(),
    assistantName: 'OSA Voice & Direct Assistant',
  };

  saveActivation(record);
  return record;
}
