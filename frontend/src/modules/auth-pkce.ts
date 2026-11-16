import { UserProfile } from '../types';

const PKCE_VERIFIER_KEY = 'gitstamp_pkce_verifier';
const PKCE_STATE_KEY = 'gitstamp_oauth_state';
const AUTH_TOKEN_KEY = 'gitstamp_auth_token';
const USER_PROFILE_KEY = 'gitstamp_user_profile';

export interface PkceConfig {
  clientId: string;
  appSlug?: string;
  redirectUri: string;
}

export function generateRandomString(length: number = 64): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset[values[i] % charset.length];
  }
  return result;
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function initiatePkceLogin(config: PkceConfig): Promise<void> {
  const verifier = generateRandomString(64);
  const state = generateRandomString(32);
  const challenge = await generateCodeChallenge(verifier);

  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(PKCE_STATE_KEY, state);

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  });

  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (isLocal && config.redirectUri) {
    params.set('redirect_uri', config.redirectUri);
  }

  window.location.href = `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function handlePkceCallback(config: PkceConfig): Promise<string | null> {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const state = urlParams.get('state');

  if (!code || !state) {
    return null;
  }

  const storedState = sessionStorage.getItem(PKCE_STATE_KEY);
  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);

  if (!storedState || state !== storedState || !verifier) {
    throw new Error('OAuth state or PKCE verifier mismatch');
  }

  sessionStorage.removeItem(PKCE_STATE_KEY);
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);

  window.history.replaceState({}, document.title, window.location.pathname);

  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const bodyPayload: Record<string, string> = {
    client_id: config.clientId,
    code,
    code_verifier: verifier
  };
  if (isLocal && config.redirectUri) {
    bodyPayload.redirect_uri = config.redirectUri;
  }

  try {
    const proxyRes = await fetch('/api/token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bodyPayload)
    });

    if (proxyRes.ok) {
      const proxyData = await proxyRes.json();
      if (proxyData.access_token) {
        setStoredToken(proxyData.access_token);
        return proxyData.access_token;
      }
    }
  } catch {}

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      client_id: config.clientId,
      code,
      code_verifier: verifier,
      redirect_uri: config.redirectUri
    })
  });

  if (!response.ok) {
    throw new Error(`Token request failed with status: ${response.status}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error_description || data.error);
  }

  const token = data.access_token;
  if (!token) {
    throw new Error('No access token returned from GitHub');
  }

  setStoredToken(token);
  return token;
}

export async function fetchUserProfile(token: string): Promise<UserProfile> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user profile: ${response.statusText}`);
  }

  const data = await response.json();
  const user: UserProfile = {
    id: data.id,
    login: data.login,
    name: data.name || data.login,
    avatar_url: data.avatar_url,
    noreply_email: `${data.id}+${data.login}@users.noreply.github.com`
  };

  sessionStorage.setItem(USER_PROFILE_KEY, JSON.stringify(user));
  return user;
}

export function getStoredToken(): string | null {
  return sessionStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  sessionStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function getStoredUser(): UserProfile | null {
  const raw = sessionStorage.getItem(USER_PROFILE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

export function clearAuth(): void {
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(USER_PROFILE_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);
}
