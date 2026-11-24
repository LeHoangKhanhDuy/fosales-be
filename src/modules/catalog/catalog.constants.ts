export const CATEGORY_ICONS = [
  'package',
  'cup-soda',
  'coffee',
  'milk',
  'beer',
  'wine',
  'cookie',
  'candy',
  'cake',
  'ice-cream',
  'sandwich',
  'soup',
  'wheat',
  'apple',
  'beef',
  'fish',
  'spray-can',
  'washing-machine',
  'sparkles',
  'pill',
  'baby',
  'paw-print',
  'shirt',
  'gift',
] as const;

export const CATEGORY_COLORS = [
  'slate',
  'sky',
  'indigo',
  'violet',
  'pink',
  'rose',
  'orange',
  'amber',
  'lime',
  'teal',
] as const;

export const CATEGORY_STATUSES = ['active', 'inactive'] as const;

export type CategoryIcon = (typeof CATEGORY_ICONS)[number];
export type CategoryColor = (typeof CATEGORY_COLORS)[number];
