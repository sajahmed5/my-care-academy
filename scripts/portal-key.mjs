#!/usr/bin/env node
/**
 * Mint an integration API key for one organisation's rostering portal.
 *
 * Superseded: platform admins now issue, replace and revoke keys from the
 * organisation's page, Integration tab. Kept for a key minted outside the app.
 *
 * Prints the key ONCE (give it to the portal's server config) and the SQL to
 * store its hash. The key is never stored anywhere on this side — only the
 * hash — so run the SQL, hand the key over, and forget it.
 *
 *   node scripts/portal-key.mjs
 */
import crypto from "node:crypto";

const key = "mca_" + crypto.randomBytes(32).toString("base64url");
const hash = crypto.createHash("sha256").update(key).digest("hex");

console.log("Integration key (copy into the PORTAL's settings, shown only once):\n");
console.log(`  ${key}\n`);
console.log("Then run this in the TRAINING platform's Supabase SQL editor,");
console.log("replacing the organisation name if needed:\n");
console.log(`  update public.organisations
     set integration_key_hash = '${hash}',
         integration_key_created_at = now()
   where name = 'HG Care';\n`);
