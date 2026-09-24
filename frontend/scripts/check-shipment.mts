// Shipment-identity parser self-check. Run: node --experimental-strip-types scripts/check-shipment.mts
import assert from "node:assert/strict";
import { derive, portCode } from "../lib/cases.ts";

const ship = (text: string, subject = "") =>
  derive({ id: "x", vessel: subject, company: "", body: "", fields: [], attachments: [{ name: "x_BL.txt", url: "u", text }] }).ship;

// Labelled lines, one value each.
const a = ship("Bill of Lading No.: MEDUUD104332\nBooking Ref: MSDUL0942518196\nVessel Name: MMSS 2507\nVoy.: 11S\nCommodity: COPIER PAPER\nFreight: PREPAID");
assert.equal(a.bl, "MEDUUD104332");
assert.equal(a.carrier, "MSC");
assert.equal(a.booking, "MSDUL0942518196");
assert.equal(a.voyage, "11S");

// Two codes on one line; the SCAC only on the booking.
const b = ship("B/L NUMBER: SINF90600780 BOOKING NO. ONEYSINF68671");
assert.equal(b.bl, "SINF90600780");
assert.equal(b.booking, "ONEYSINF68671");
assert.equal(b.carrier, "ONE");

// Unreadable BL: the subject's last segment still names it.
assert.equal(ship("", "TO CONFIRM DOCS _ CALLAO_PERU _ HLCUSIN123456").carrier, "Hapag-Lloyd");

assert.equal(portCode("PORT KLANG (WESTPORT), MALAYSIA (MYPKG)"), "MYPKG");
assert.equal(portCode("FREMANTLE, AUSTRALIA"), "FREMANTLE");
console.log("shipment parser: ok");
