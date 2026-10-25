/* ==========================================================================
   webpush.js — sending a Web Push message with nothing but node:crypto.

   Two standards, both small enough to do by hand rather than pull in a
   dependency for:
   · VAPID (RFC 8292): the push service accepts a message only with a JWT
     signed (ES256) by the key pair whose public half the browser was given
     when it subscribed.
   · Message encryption (RFC 8291, "aes128gcm" from RFC 8188): the payload
     is encrypted to the subscription's own P-256 key and auth secret, so
     the push service relays bytes it cannot read.

   The key pair is generated once and kept by the caller (Netlify Blobs);
   nothing here holds state.
   ========================================================================== */

import crypto from 'node:crypto';

export const b64u = (buf) => Buffer.from(buf).toString('base64url');
export const unb64u = (s) => Buffer.from(String(s), 'base64url');

/** A fresh VAPID key pair: the public key as the 65-byte point the browser wants, the private one as a JWK. */
export function makeVapidKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pub = publicKey.export({ format: 'jwk' });
  return {
    publicKey: b64u(Buffer.concat([Buffer.from([4]), unb64u(pub.x), unb64u(pub.y)])),
    privateJwk: privateKey.export({ format: 'jwk' })
  };
}

/** The VAPID Authorization header for one push service. */
export function vapidHeader(endpoint, { publicKey, privateJwk }, subject, now = Date.now()) {
  const aud = new URL(endpoint).origin;
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }));
  const data = `${header}.${claims}`;
  const key = crypto.createPrivateKey({ key: privateJwk, format: 'jwk' });
  const sig = crypto.sign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${data}.${b64u(sig)}, k=${publicKey}`;
}

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

/**
 * Encrypt a payload for one subscription (RFC 8291 / aes128gcm).
 * @param {string|Buffer} payload
 * @param {{p256dh:string, auth:string}} keys from PushSubscription.toJSON().keys
 * @returns {Buffer} the request body
 */
export function encrypt(payload, keys, { salt = crypto.randomBytes(16), ecdh = null } = {}) {
  const uaPublic = unb64u(keys.p256dh);
  const authSecret = unb64u(keys.auth);
  const local = ecdh || crypto.createECDH('prime256v1');
  if (!ecdh) local.generateKeys();
  const asPublic = local.getPublicKey();
  const shared = local.computeSecret(uaPublic);

  /* IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0 || ua_public || as_public, 32) */
  const prkKey = hmac(authSecret, shared);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]);
  const ikm = hmac(prkKey, keyInfo);

  /* CEK and nonce from the salt (RFC 8188) */
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);

  /* One record: the payload and the 0x02 delimiter that marks it as the last. */
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

/**
 * Send one notification.
 * @returns {Promise<{ok:boolean, status:number, gone:boolean}>} gone: the
 *   subscription no longer exists and should be forgotten.
 */
export async function sendPush(subscription, payload, vapid, subject, { ttl = 3 * 3600, urgency = 'normal', topic = null } = {}) {
  const body = encrypt(typeof payload === 'string' ? payload : JSON.stringify(payload), subscription.keys);
  const headers = {
    'content-type': 'application/octet-stream',
    'content-encoding': 'aes128gcm',
    ttl: String(ttl),
    urgency,
    authorization: vapidHeader(subscription.endpoint, vapid, subject)
  };
  /* A newer reminder of the same kind replaces an undelivered older one. */
  if (topic) headers.topic = topic;
  const res = await fetch(subscription.endpoint, { method: 'POST', headers, body });
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 };
}
