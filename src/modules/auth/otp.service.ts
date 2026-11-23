import { createHash, randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { hmacSha256, safeEqual } from '../../common/security/crypto';
import { maskPhone, normalizePhone } from '../../common/utils/mask';
import { AppConfig } from '../../config/app-config';

@Injectable()
export class OtpService {
  private readonly key: Buffer;

  constructor(config: AppConfig) {
    this.key = createHash('sha256').update(`otp:${config.jwtSecret}`).digest();
  }

  generate(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  hash(userId: string, code: string): string {
    return hmacSha256(this.key, `${userId}:${code}`);
  }

  verify(userId: string, code: string, codeHash: string): boolean {
    return safeEqual(this.hash(userId, code), codeHash);
  }

  decoyTarget(account: string): string {
    const phone = normalizePhone(account);
    if (phone) return maskPhone(phone);
    const digits = hmacSha256(this.key, `decoy:${account.trim().toLowerCase()}`)
      .replace(/\D/g, '')
      .padEnd(8, '0');
    return maskPhone(`09${digits.slice(0, 8)}`);
  }
}
