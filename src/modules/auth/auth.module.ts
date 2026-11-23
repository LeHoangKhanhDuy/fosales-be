import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AppConfig } from '../../config/app-config';
import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../users/users.module';
import { AuthCookies } from './auth-cookies.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginAttemptsService } from './login-attempts.service';
import { OtpService } from './otp.service';
import { PasswordResetService } from './password-reset.service';
import { PasswordService } from './password.service';
import { SessionCacheService } from './session-cache.service';
import { SessionsService } from './sessions.service';
import { SmsService } from './sms.service';
import { TokensService } from './tokens.service';

@Module({
  imports: [
    UsersModule,
    AuditModule,
    JwtModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        secret: config.jwtSecret,
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordResetService,
    SessionsService,
    SessionCacheService,
    TokensService,
    AuthCookies,
    LoginAttemptsService,
    PasswordService,
    OtpService,
    SmsService,
  ],
  exports: [TokensService, SessionCacheService],
})
export class AuthModule {}
