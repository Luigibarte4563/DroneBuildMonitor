import test from "node:test";
import assert from "node:assert/strict";
import { encodeOrder, decodeOrder } from "./refund-data.js";

const order = {
  id: "DBM-ABC123",
  items: [
    { name: "Site Mapping", unit: "per site, up to 5 ha", qty: 1, price: 35000 },
    { name: "Inspección Aérea", unit: "por visita", qty: 2, price: 15000 },
  ],
  subtotal: 65000,
  vat: 7800,
  total: 72800,
  method: "Online Banking - BDO",
};

test("an order payload round-trips through the refund link", () => {
  assert.deepEqual(decodeOrder(encodeOrder(order)), order);
});

test("malformed order payloads return null", () => {
  assert.equal(decodeOrder("not-base64"), null);
  assert.equal(decodeOrder(""), null);
});
