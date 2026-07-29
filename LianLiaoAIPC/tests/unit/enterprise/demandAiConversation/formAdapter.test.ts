import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';

import type { EnterpriseDemandPublishSchema } from '@/common/enterprise/contracts';
import {
  toManualPatch,
  toPublishFormPatch,
} from '@/renderer/pages/enterprise/supplyDemand/Publish/assistant/demandAiFormAdapter';

const schema: EnterpriseDemandPublishSchema = {
  typeId: 22,
  typeName: '紧急采购',
  variantCode: 'DEFAULT',
  variants: [],
  fields: [
    {
      fieldKey: 'quantity',
      fieldLabel: '采购数量',
      inputType: 'NUMBER',
      required: true,
      maxLength: 20,
      options: [],
    },
    {
      fieldKey: 'deliveryDate',
      fieldLabel: '交付日期',
      inputType: 'DATE',
      required: false,
      maxLength: 20,
      options: [],
    },
    {
      fieldKey: 'processType',
      fieldLabel: '加工方式',
      inputType: 'MULTISELECT',
      required: false,
      maxLength: 100,
      options: ['车削', '铣削'],
      valueSeparator: '、',
    },
  ],
};

describe('demand AI form adapter', () => {
  it('converts typed AI snapshots for the existing form controls', () => {
    const result = toPublishFormPatch(schema, {
      quantity: { value: '200', source: 'AI', updatedTurn: 1, locked: false },
      deliveryDate: { value: '2026-08-20', source: 'AI', updatedTurn: 1, locked: false },
      processType: { value: '车削、铣削', source: 'AI', updatedTurn: 1, locked: false },
    });

    expect(result.quantity).toBe(200);
    expect(dayjs.isDayjs(result.deliveryDate)).toBe(true);
    expect(result.processType).toEqual(['车削', '铣削']);
  });

  it('drops unknown manual fields before synchronization', () => {
    expect(toManualPatch(schema, { quantity: 300, injectedColumn: 'unsafe' })).toEqual({
      quantity: '300',
    });
  });
});
