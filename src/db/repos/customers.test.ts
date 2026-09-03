import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { db } from '../client';
import { openTestDb, type TestDb } from '../testDb';
import {
  createCustomer,
  deleteCustomerPhoto,
  getCustomer,
  getCustomerPhoto,
  setCustomerPhoto,
} from './customersRepo';

let handle: TestDb;

beforeEach(async () => {
  handle = await openTestDb();
});

afterEach(() => {
  handle.close();
});

describe('customer photos', () => {
  it('round-trips a portrait and exposes its presence without reading its bytes', async () => {
    const customerId = await createCustomer({ name: 'Akram' });
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

    await setCustomerPhoto(customerId, {
      mime: 'image/jpeg',
      width: 640,
      height: 480,
      bytes,
    });

    expect((await getCustomer(customerId))?.hasPhoto).toBe(true);
    const stored = await getCustomerPhoto(customerId);
    expect(stored).toMatchObject({ mime: 'image/jpeg', width: 640, height: 480 });
    expect(Array.from(stored!.bytes)).toEqual(Array.from(bytes));

    await deleteCustomerPhoto(customerId);
    expect((await getCustomer(customerId))?.hasPhoto).toBe(false);
  });

  it('deletes a portrait with its customer', async () => {
    const customerId = await createCustomer({ name: 'Bashir' });
    await setCustomerPhoto(customerId, {
      mime: 'image/jpeg',
      width: 1,
      height: 1,
      bytes: new Uint8Array([1]),
    });

    await db.exec('DELETE FROM customers WHERE id = ?', [customerId]);
    expect(await getCustomerPhoto(customerId)).toBeNull();
  });
});
