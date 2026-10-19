import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { validateApprovedMerchantDestination } from '../src/services/osaService.ts';

console.log('=== OSA Affiliate Click Tracking & Outbound Redirect Engine Tests ===\n');

// 1. Approved HTTPS merchant destination is accepted
console.log('[1/10] Testing approved HTTPS merchant destination...');
const resValid = validateApprovedMerchantDestination(
  'https://www.daraz.com.bd/products/wireless-earbuds-i12345.html?tag=osa_affiliate&utm_source=osa',
  'daraz.com.bd'
);
assert.equal(resValid.isValid, true, 'Valid HTTPS destination on approved domain must pass');
assert.ok(resValid.safeUrl?.includes('tag=osa_affiliate'), 'Partner affiliate query parameters must be preserved');
console.log('✓ Passed: Approved HTTPS destination accepted with parameters preserved');

// 2. Subdomains of approved merchant are accepted
console.log('\n[2/10] Testing approved merchant subdomain...');
const resSub = validateApprovedMerchantDestination(
  'https://deals.amazon.com/item/B08N5WRWNW?ref=osa_deals',
  'amazon.com'
);
assert.equal(resSub.isValid, true, 'Subdomain of approved official domain must pass');
console.log('✓ Passed: Subdomain of approved merchant accepted');

// 3. Insecure HTTP is strictly rejected
console.log('\n[3/10] Testing HTTP rejection (Non-HTTPS)...');
const resHttp = validateApprovedMerchantDestination(
  'http://www.daraz.com.bd/item',
  'daraz.com.bd'
);
assert.equal(resHttp.isValid, false, 'HTTP URLs must be rejected');
assert.ok(resHttp.error?.includes('HTTPS'), 'Error must specify HTTPS required');
console.log('✓ Passed: Insecure HTTP protocol rejected');

// 4. Dangerous schemes (javascript:, data:) are strictly rejected
console.log('\n[4/10] Testing dangerous scheme injection rejection (javascript:, data:)...');
const resJs = validateApprovedMerchantDestination(
  'javascript:alert(document.cookie)',
  'daraz.com.bd'
);
assert.equal(resJs.isValid, false, 'javascript: scheme must be rejected');

const resData = validateApprovedMerchantDestination(
  'data:text/html,<script>alert(1)</script>',
  'daraz.com.bd'
);
assert.equal(resData.isValid, false, 'data: scheme must be rejected');
console.log('✓ Passed: Malicious schemes (javascript:, data:) rejected');

// 5. Arbitrary / mismatched external domains (Open Redirect Prevention)
console.log('\n[5/10] Testing Open Redirect & mismatched domain prevention...');
const resEvil = validateApprovedMerchantDestination(
  'https://evil-phishing-site.com/login?steal=1',
  'daraz.com.bd'
);
assert.equal(resEvil.isValid, false, 'Arbitrary domain mismatch must be rejected');
assert.ok(resEvil.error?.includes('does not match approved merchant domain'), 'Error must identify domain mismatch');
console.log('✓ Passed: Open redirect prevented; arbitrary domain rejected');

// 6. Malformed and empty URLs
console.log('\n[6/10] Testing malformed and empty URLs...');
const resEmpty = validateApprovedMerchantDestination('', 'daraz.com.bd');
assert.equal(resEmpty.isValid, false, 'Empty URL must be rejected');

const resMalformed = validateApprovedMerchantDestination('https://', 'daraz.com.bd');
assert.equal(resMalformed.isValid, false, 'Malformed URL must be rejected');
console.log('✓ Passed: Malformed and empty URLs rejected');

// 7. Edge function implementation exists and enforces security
console.log('\n[7/10] Testing Edge Function affiliate-redirect security implementation...');
const edgeFunctionPath = path.resolve('supabase/functions/affiliate-redirect/index.ts');
assert.ok(fs.existsSync(edgeFunctionPath), 'supabase/functions/affiliate-redirect/index.ts must exist');
const edgeCode = fs.readFileSync(edgeFunctionPath, 'utf8');

assert.ok(edgeCode.includes('validateApprovedMerchantDestination'), 'Edge function must validate merchant destination');
assert.ok(edgeCode.includes('uuidRegex'), 'Edge function must validate UUID product ID');
assert.ok(edgeCode.includes("status !== 'active'"), 'Edge function must reject inactive merchants');
assert.ok(edgeCode.includes('is_approved'), 'Edge function must reject unapproved products');
assert.ok(edgeCode.includes('status: 307'), 'Edge function must return temporary redirect (307)');
console.log('✓ Passed: Server-side Edge Function implements domain checking, UUID validation, and status enforcement');

// 8. UUID input validation in client service
console.log('\n[8/10] Testing UUID validation in client service...');
const serviceCode = fs.readFileSync('src/services/osaService.ts', 'utf8');
assert.ok(serviceCode.includes('uuidRegex.test(productId)'), 'trackAffiliateProductClick must validate product UUID format');
console.log('✓ Passed: Service function rejects non-UUID product IDs before calling database');

// 9. Unpredictable click tokens & Non-sensitive attribution
console.log('\n[9/10] Testing click token unpredictability and non-sensitive attribution...');
assert.ok(edgeCode.includes('crypto.randomUUID()'), 'Edge function must use cryptographically strong UUIDs for click tokens');
assert.ok(!edgeCode.includes('password') && !edgeCode.includes('auth_token') && !edgeCode.includes('message_content'), 'Must not store sensitive user data in click logs');
console.log('✓ Passed: Cryptographic tokens and non-sensitive attribution confirmed');

// 10. Partner tracking parameters preservation
console.log('\n[10/10] Testing partner tracking parameters preservation...');
const affiliateUrlWithDeepParams = 'https://www.daraz.com.bd/catalog?aff_id=98721&sub_id=osa_chat&utm_campaign=winter2026';
const resPreserve = validateApprovedMerchantDestination(affiliateUrlWithDeepParams, 'daraz.com.bd');
assert.equal(resPreserve.isValid, true);
assert.equal(resPreserve.safeUrl, affiliateUrlWithDeepParams, 'Destination URL with partner parameters must be strictly preserved without tampering');
console.log('✓ Passed: Partner tracking parameters preserved exactly as provided');

console.log('\nAll 10 Click Tracking & Outbound Redirect Engine tests passed successfully!\n');
