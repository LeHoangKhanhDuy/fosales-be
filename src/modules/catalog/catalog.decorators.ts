import { applyDecorators, ParseUUIDPipe } from '@nestjs/common';
import { Roles } from '../../common/decorators/auth.decorators';
import { ApiErrors } from '../../common/decorators/api-errors.decorator';

export const ManageCatalog = (...statuses: number[]) =>
  applyDecorators(Roles('admin', 'manager'), ApiErrors(400, 401, 403, ...statuses));

export const uuidOr = (error: () => Error) => new ParseUUIDPipe({ exceptionFactory: error });
