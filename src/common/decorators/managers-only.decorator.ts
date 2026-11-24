import { applyDecorators, ParseUUIDPipe } from '@nestjs/common';
import { ApiErrors } from './api-errors.decorator';
import { Roles } from './auth.decorators';

export const ManagersOnly = (...statuses: number[]) =>
  applyDecorators(Roles('admin', 'manager'), ApiErrors(400, 401, 403, ...statuses));

export const uuidOr = (error: () => Error) => new ParseUUIDPipe({ exceptionFactory: error });
