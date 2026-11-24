import { Prisma } from '@prisma/client';

type PrismaErrorMap = Partial<Record<'P2002' | 'P2003' | 'P2025', () => Error>>;

export function rethrowPrisma(map: PrismaErrorMap) {
  return (error: unknown): never => {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const factory = map[error.code as keyof PrismaErrorMap];
      if (factory) throw factory();
    }
    throw error;
  };
}
