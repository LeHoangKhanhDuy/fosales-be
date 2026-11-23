import { Injectable, Logger } from '@nestjs/common';
import { maskPhone } from '../../common/utils/mask';
import { AppConfig } from '../../config/app-config';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly config: AppConfig) {}

  async sendOtp(phone: string, code: string): Promise<void> {
    if (this.config.isDevelopment) {
      this.logger.warn(`[DEV] OTP đặt lại mật khẩu cho ${maskPhone(phone)}: ${code}`);
      return;
    }
    this.logger.error(`Chưa cấu hình nhà cung cấp SMS, không gửi được OTP tới ${maskPhone(phone)}`);
  }
}
