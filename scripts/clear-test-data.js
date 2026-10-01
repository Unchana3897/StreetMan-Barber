// Prints SQL that removes test data from the database before the shop goes live.
//
//   node scripts/clear-test-data.js --since "2026-10-02 03:30" --preview > .wrangler/clear.sql
//   npx wrangler d1 execute streetman-barber-db --remote --file .wrangler/clear.sql   (shows counts only)
//   node scripts/clear-test-data.js --since "2026-10-02 03:30" > .wrangler/clear.sql
//   npx wrangler d1 execute streetman-barber-db --remote --file .wrangler/clear.sql   (deletes)
//
// --since "YYYY-MM-DD HH:MM"  Bangkok time testing started. Removes queues, walk-ins and
//                             bills created from then on, bill edits and reference codes,
//                             and undoes payments taken during testing on older queues.
// --all                       Removes every queue and bill (only if there is no real data yet).
// Always kept: staff accounts, menu & prices, PromptPay / QR, shop settings, barbers'
// blocked hours, notification registrations. Back up first: wrangler d1 export.
"use strict";

const args = process.argv.slice(2);
const preview = args.includes("--preview");
const all = args.includes("--all");
const sinceArg = (args[args.indexOf("--since") + 1] || "");
if (!all && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(sinceArg)) {
    console.error('Usage: node scripts/clear-test-data.js --since "YYYY-MM-DD HH:MM" [--preview]   or   --all [--preview]');
    process.exit(1);
}
const sinceIso = all ? "0000" : new Date(sinceArg.replace(" ", "T") + ":00+07:00").toISOString();
const sinceMs = all ? 0 : Date.parse(sinceIso);
const q = (v) => `'${v}'`;

const newRows = `created_at >= ${q(sinceIso)}`;
const paidDuringTest = `created_at < ${q(sinceIso)} AND paid_at >= ${q(sinceIso)}`;

if (preview) {
    console.log(`SELECT
  (SELECT COUNT(*) FROM bookings WHERE ${newRows}) AS queues_and_bills_to_delete,
  (SELECT COUNT(*) FROM bookings WHERE ${all ? "0" : paidDuringTest}) AS older_queues_payment_undone,
  (SELECT COUNT(*) FROM bookings WHERE ${all ? "0" : `created_at < ${q(sinceIso)}`}) AS queues_kept,
  (SELECT COUNT(*) FROM bill_edits) AS bill_edits_total,
  (SELECT COUNT(*) FROM approval_codes WHERE created_at >= ${sinceMs}) AS codes_to_delete,
  (SELECT MIN(created_at) FROM bookings WHERE ${newRows}) AS first_deleted,
  (SELECT MAX(created_at) FROM bookings WHERE ${all ? "0" : `created_at < ${q(sinceIso)}`}) AS last_kept;`);
    process.exit(0);
}

console.log([
    `DELETE FROM bill_edits WHERE booking_id IN (SELECT id FROM bookings WHERE ${newRows}) OR edited_at >= ${q(sinceIso)};`,
    `DELETE FROM bookings WHERE ${newRows};`,
    // Older real queues that were charged while testing: back to "not charged yet".
    all ? "" : `UPDATE bookings SET payment_method=NULL, paid_at=NULL WHERE ${paidDuringTest};`,
    `DELETE FROM approval_codes WHERE created_at >= ${sinceMs};`,
    `DELETE FROM login_attempts;`
].filter(Boolean).join("\n"));
