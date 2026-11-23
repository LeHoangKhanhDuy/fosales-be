import '@fastify/cookie';
import { Injectable } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ACCESS_COOKIE, CSRF_COOKIE, REFRESH_COOKIE } from '../../common/constants';
import { AppConfig } from '../../config/app-config';

type CookieOptions = NonNullable<Parameters<FastifyReply['setCookie']>[2]>;

interface AuthCookieValues {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  remember: boolean;
}

@Injectable()
export class AuthCookies {
  constructor(private readonly config: AppConfig) {}

  set(reply: FastifyReply, values: AuthCookieValues) {
    const persistent = values.remember ? this.config.refreshTtlRemember : undefined;
    void reply.setCookie(ACCESS_COOKIE, values.accessToken, {
      ...this.access(),
      maxAge: this.config.accessTtl,
    });
    void reply.setCookie(REFRESH_COOKIE, values.refreshToken, {
      ...this.refresh(),
      maxAge: persistent,
    });
    void reply.setCookie(CSRF_COOKIE, values.csrfToken, { ...this.csrf(), maxAge: persistent });
  }

  clear(reply: FastifyReply) {
    void reply.clearCookie(ACCESS_COOKIE, this.access());
    void reply.clearCookie(REFRESH_COOKIE, this.refresh());
    void reply.clearCookie(CSRF_COOKIE, this.csrf());
  }

  private base(): CookieOptions {
    return { secure: this.config.cookieSecure, domain: this.config.cookieDomain };
  }

  private access(): CookieOptions {
    return { ...this.base(), httpOnly: true, sameSite: 'lax', path: '/api' };
  }

  private refresh(): CookieOptions {
    return { ...this.base(), httpOnly: true, sameSite: 'strict', path: '/api/auth' };
  }

  private csrf(): CookieOptions {
    return { ...this.base(), httpOnly: false, sameSite: 'lax', path: '/' };
  }
}
