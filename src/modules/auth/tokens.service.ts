import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Role, User } from '@prisma/client';
import { randomToken } from '../../common/security/crypto';
import { AppConfig } from '../../config/app-config';

const ISSUER = 'fosales-api';
const AUDIENCE = 'fosales-web';

export interface AccessPayload {
  sub: string;
  role: Role;
  storeId: string;
  sid: string;
  iat: number;
  exp: number;
}

@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
  ) {}

  async signAccess(user: Pick<User, 'id' | 'role' | 'storeId'>, sid: string) {
    const token = await this.jwt.signAsync(
      { role: user.role, storeId: user.storeId, sid },
      { subject: user.id, expiresIn: this.config.accessTtl, issuer: ISSUER, audience: AUDIENCE },
    );
    return { token, expiresAt: new Date(Date.now() + this.config.accessTtl * 1000) };
  }

  async verifyAccess(token: string, ignoreExpiration = false): Promise<AccessPayload | null> {
    try {
      const payload = await this.jwt.verifyAsync<AccessPayload>(token, {
        issuer: ISSUER,
        audience: AUDIENCE,
        ignoreExpiration,
      });
      const valid = typeof payload.sub === 'string' && typeof payload.sid === 'string';
      return valid && typeof payload.iat === 'number' ? payload : null;
    } catch {
      return null;
    }
  }

  createRefreshToken() {
    return randomToken(32);
  }

  createCsrfToken() {
    return randomToken(32);
  }
}
