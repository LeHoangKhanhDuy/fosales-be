import type { Prisma } from '@prisma/client';

export async function addEvents(
  tx: Prisma.TransactionClient,
  poId: string,
  byId: string,
  ...labels: string[]
) {
  const now = Date.now();
  await tx.purchaseOrderEvent.createMany({
    data: labels.map((label, index) => ({ poId, byId, label, at: new Date(now + index) })),
  });
}
