import '@fastify/cookie';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiCookieAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthUser } from '../../common/auth-user';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../common/constants';
import { Client, CurrentUser, Public, SkipCsrf } from '../../common/decorators/auth.decorators';
import { Errors } from '../../common/errors';
import type { ClientInfo } from '../../common/http/client-info';
import { AuthService } from './auth.service';
import { ChangePasswordDto, ForgotPasswordDto, LoginDto, ResetPasswordDto } from './dto/auth.dto';
import { PasswordResetService } from './password-reset.service';

const LOGIN_LIMIT = { default: { limit: 10, ttl: 60_000 } };
const RECOVERY_LIMIT = { default: { limit: 5, ttl: 15 * 60_000 } };

@ApiTags('auth')
@ApiCookieAuth(ACCESS_COOKIE)
@ApiSecurity('csrf')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly recovery: PasswordResetService,
  ) {}

  @Public()
  @SkipCsrf()
  @Throttle(LOGIN_LIMIT)
  @Post('login')
  @HttpCode(200)
  login(
    @Body() dto: LoginDto,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.auth.login(dto, client, reply);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(
    @Req() req: FastifyRequest,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.auth.refresh(req.cookies[REFRESH_COOKIE], client, reply);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: FastifyRequest,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.auth.logout(req.cookies[REFRESH_COOKIE], req.cookies[ACCESS_COOKIE], client, reply);
  }

  @Post('logout-all')
  @HttpCode(204)
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.auth.logoutAll(user, client, reply);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @Get('sessions')
  sessions(@CurrentUser() user: AuthUser) {
    return this.auth.listSessions(user);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async revokeSession(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ exceptionFactory: () => Errors.sessionNotFound() }))
    id: string,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.auth.revokeSession(user, id, client, reply);
  }

  @Post('change-password')
  @HttpCode(200)
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.auth.changePassword(user, dto, client, reply);
  }

  @Public()
  @SkipCsrf()
  @Throttle(RECOVERY_LIMIT)
  @Post('forgot-password')
  @HttpCode(200)
  forgotPassword(@Body() dto: ForgotPasswordDto, @Client() client: ClientInfo) {
    return this.recovery.request(dto, client);
  }

  @Public()
  @SkipCsrf()
  @Throttle(RECOVERY_LIMIT)
  @Post('reset-password')
  @HttpCode(204)
  async resetPassword(@Body() dto: ResetPasswordDto, @Client() client: ClientInfo) {
    await this.recovery.reset(dto, client);
  }
}
