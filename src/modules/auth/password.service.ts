import { Injectable } from '@nestjs/common';
import { randomToken } from '../../common/security/crypto';
import { hashPassword, passwordNeedsRehash, verifyPassword } from '../../common/security/password';

@Injectable()
export class PasswordService {
  private dummyHash?: Promise<string>;

  hash(password: string) {
    return hashPassword(password);
  }

  verify(hash: string, password: string) {
    return verifyPassword(hash, password);
  }

  async verifyDummy(password: string) {
    this.dummyHash ??= hashPassword(randomToken(16));
    await verifyPassword(await this.dummyHash, password);
  }

  async rehashIfNeeded(hash: string, password: string) {
    return passwordNeedsRehash(hash) ? hashPassword(password) : undefined;
  }
}
