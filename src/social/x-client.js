/**
 * Official X API v2 client — POST /2/tweets.
 *
 * Credentials come ONLY from the environment (never from files in the repo):
 *
 *   OAuth 1.0a user context (default):
 *     X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET
 *   OAuth 2.0 user access token (alternative, needs tweet.write scope):
 *     X_OAUTH2_ACCESS_TOKEN
 *
 * Zero dependencies: HMAC-SHA1 signing uses node:crypto.
 */
import { createHmac, randomBytes } from 'node:crypto';

export const X_TWEETS_URL = 'https://api.x.com/2/tweets';

export function percentEncode(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/**
 * Build the OAuth 1.0a signature base string and HMAC-SHA1 signature.
 * `params` must include oauth_* parameters and any query/form parameters.
 */
export function oauth1Signature({ method, url, params, consumerSecret, tokenSecret }) {
  const normalized = Object.entries(params)
    .map(([k, v]) => [percentEncode(k), percentEncode(String(v))])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const base = [method.toUpperCase(), percentEncode(url), percentEncode(normalized)].join('&');
  const key = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret ?? '')}`;
  return { base, signature: createHmac('sha1', key).update(base).digest('base64') };
}

export function oauth1Header({ method, url, creds, extraParams = {}, nonce, timestamp }) {
  const oauthParams = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: nonce ?? randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp ?? Math.floor(Date.now() / 1000),
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
  };
  const { signature } = oauth1Signature({
    method,
    url,
    params: { ...oauthParams, ...extraParams },
    consumerSecret: creds.apiSecret,
    tokenSecret: creds.accessTokenSecret,
  });
  const all = { ...oauthParams, oauth_signature: signature };
  return 'OAuth ' + Object.keys(all).sort().map(k => `${percentEncode(k)}="${percentEncode(all[k])}"`).join(', ');
}

export function getCredentialsFromEnv(env = process.env) {
  if (env.X_OAUTH2_ACCESS_TOKEN) return { type: 'oauth2', accessToken: env.X_OAUTH2_ACCESS_TOKEN };
  const { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET } = env;
  if (X_API_KEY && X_API_SECRET && X_ACCESS_TOKEN && X_ACCESS_TOKEN_SECRET) {
    return {
      type: 'oauth1',
      apiKey: X_API_KEY,
      apiSecret: X_API_SECRET,
      accessToken: X_ACCESS_TOKEN,
      accessTokenSecret: X_ACCESS_TOKEN_SECRET,
    };
  }
  return null;
}

/**
 * Post a tweet. Returns { ok, id, url, response } or { ok, error, status, retryable }.
 * `fetchImpl` is injectable for tests.
 */
export async function postTweet(text, { creds = getCredentialsFromEnv(), fetchImpl = fetch } = {}) {
  if (!creds) {
    return {
      ok: false,
      status: 0,
      retryable: false,
      error: 'No X API credentials in environment (set X_API_KEY/X_API_SECRET/X_ACCESS_TOKEN/X_ACCESS_TOKEN_SECRET or X_OAUTH2_ACCESS_TOKEN)',
    };
  }
  const headers = { 'Content-Type': 'application/json' };
  headers.Authorization = creds.type === 'oauth2'
    ? `Bearer ${creds.accessToken}`
    : oauth1Header({ method: 'POST', url: X_TWEETS_URL, creds });

  let res;
  try {
    res = await fetchImpl(X_TWEETS_URL, { method: 'POST', headers, body: JSON.stringify({ text }) });
  } catch (err) {
    return { ok: false, status: 0, retryable: true, error: err.message };
  }
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok || !body?.data?.id) {
    return {
      ok: false,
      status: res.status,
      retryable: res.status === 429 || res.status >= 500,
      error: body?.detail || body?.title || body?.errors?.[0]?.message || `X API error ${res.status}`,
      response: body,
    };
  }
  return { ok: true, id: body.data.id, url: `https://x.com/i/web/status/${body.data.id}`, response: body };
}
