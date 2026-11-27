#!/usr/bin/env node
/* 비서실 현황 데이터 봉인 도구
   평문 status.json(저장소 밖에 보관) → office/data/status.enc.json (AES-256-GCM)
   사용:  OFFICE_KEY="비서실 열쇠" OFFICE_PIN=1234 node tools/seal-status.mjs <평문 status.json 경로>
   · 열쇠는 환경변수로만 받고, 파일·로그에 남기지 않습니다.
   · PIN은 소금(salt)과 함께 해시로 바꿔 암호문 안에만 넣습니다.            */
import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ITER = 600000;
const src = process.argv[2];
const pass = process.env.OFFICE_KEY;
const pin = process.env.OFFICE_PIN;
if (!src || !pass || !pin) {
  console.error('사용법: OFFICE_KEY="열쇠" OFFICE_PIN=4자리 node tools/seal-status.mjs <평문 status.json>');
  process.exit(1);
}
if (!/^[0-9]{4}$/.test(pin)) { console.error('PIN은 숫자 4자리여야 해요'); process.exit(1); }
if (pass.length < 16) { console.error('열쇠는 16자 이상으로 해 주세요'); process.exit(1); }

const b64 = (u8) => Buffer.from(u8).toString('base64');
const hex = (buf) => Buffer.from(buf).toString('hex');
const enc = new TextEncoder();

const data = JSON.parse(readFileSync(src, 'utf8'));
const pinSalt = hex(crypto.getRandomValues(new Uint8Array(16)));
data.security = {
  pinSalt,
  pinHash: hex(await crypto.subtle.digest('SHA-256', enc.encode(pinSalt + ':' + pin)))
};

const v = 2;
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const base = await crypto.subtle.importKey('raw', enc.encode(pass.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER },
  base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const ct = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv, additionalData: enc.encode('ny-office:v' + v) },
  key, enc.encode(JSON.stringify(data)));

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'office', 'data', 'status.enc.json');
writeFileSync(out, JSON.stringify({ v, kdf: 'PBKDF2-SHA256', iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ct)) }) + '\n');
console.log('봉인 완료 →', path.relative(process.cwd(), out));
