import { Transform } from 'class-transformer';
import { collapseSpaces } from '../../../common/utils/text';

export const TrimName = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? collapseSpaces(value) : value,
  );

export const NullableText = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  );

export const QueryBoolean = (fallback: boolean) =>
  Transform(({ value }: { value: unknown }) =>
    value === undefined || value === '' ? fallback : value === true || value === 'true',
  );
