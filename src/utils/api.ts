import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

const RAW_API_BASE = (import.meta.env.VITE_API_BASE_URL || '')
  .trim()
  .replace(/\/+$/, '');

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function getApiBaseUrl(): string {
  return RAW_API_BASE;
}

export function isLocalDevUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.0\.2\.2)(:\d+)?(\/|$)/i.test(
    url.trim()
  );
}

export function getNativeApiConfigIssue(): string | null {
  if (!isNativeApp()) return null;
  if (!RAW_API_BASE) {
    return 'Backend server URL is not configured in this APK build. Rebuild with VITE_API_BASE_URL set to your deployed HTTPS CampusDesk server.';
  }
  if (isLocalDevUrl(RAW_API_BASE)) {
    return 'This APK is configured with a local development address instead of a public HTTPS server.';
  }
  return null;
}

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return RAW_API_BASE ? `${RAW_API_BASE}${normalized}` : normalized;
}

export async function apiFetch(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const nativeConfigIssue = getNativeApiConfigIssue();
  if (nativeConfigIssue) {
    throw new Error(nativeConfigIssue);
  }

  const { timeoutMs = 15000, signal, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  try {
    return await fetch(apiUrl(path), {
      ...rest,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function openExternalUrl(
  url: string,
  event?: { preventDefault: () => void }
): Promise<void> {
  if (isNativeApp()) {
    event?.preventDefault();
    await Browser.open({ url });
  }
}
