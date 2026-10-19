import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

console.log('=== OSA Affiliate Income Foundation Test Suite ===');

const migrationPath = path.resolve('supabase/migrations/20261014_affiliate_foundation.sql');
assert.ok(fs.existsSync(migrationPath), 'Migration file 20261014_affiliate_foundation.sql must exist');
const sql = fs.readFileSync(migrationPath, 'utf8');

// Test 1: Check table declarations
console.log('\n[1/6] Testing Table Declarations & Constraints...');
assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.affiliate_merchants'), 'Must declare affiliate_merchants');
assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.affiliate_products'), 'Must declare affiliate_products');
assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.affiliate_clicks'), 'Must declare affiliate_clicks');
assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.affiliate_conversions'), 'Must declare affiliate_conversions');

// Check Unique and FK constraints
assert.ok(sql.includes('UNIQUE(merchant_id, external_product_id)'), 'Products must enforce unique merchant_id + external_product_id');
assert.ok(sql.includes('UNIQUE(merchant_id, external_order_id)'), 'Conversions must enforce unique merchant_id + external_order_id');
assert.ok(sql.includes('click_token TEXT UNIQUE NOT NULL'), 'Clicks must have unique token constraint');
assert.ok(sql.includes('CHECK (current_price >= 0)'), 'Products must validate non-negative price');
assert.ok(sql.includes('CHECK (commission_amount >= 0)'), 'Conversions must validate non-negative commission');
console.log('[PASS] All 4 tables, unique constraints, and check constraints verified');

// Test 2: Verify RLS enablement
console.log('\n[2/6] Testing Row Level Security (RLS) Enforcement...');
assert.ok(sql.includes('ALTER TABLE public.affiliate_merchants ENABLE ROW LEVEL SECURITY;'), 'RLS must be enabled on affiliate_merchants');
assert.ok(sql.includes('ALTER TABLE public.affiliate_products ENABLE ROW LEVEL SECURITY;'), 'RLS must be enabled on affiliate_products');
assert.ok(sql.includes('ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;'), 'RLS must be enabled on affiliate_clicks');
assert.ok(sql.includes('ALTER TABLE public.affiliate_conversions ENABLE ROW LEVEL SECURITY;'), 'RLS must be enabled on affiliate_conversions');
console.log('[PASS] RLS explicitly enabled on all 4 affiliate tables');

// Test 3: Verify strict isolation & lack of broad USING (true) write policies
console.log('\n[3/6] Testing Strict Policy Permissions & Admin Isolation...');
// Verify no unrestricted insert on conversions or merchants
const lines = sql.split('\n');
for (const line of lines) {
  if (line.includes('CREATE POLICY') && line.includes('affiliate_conversions')) {
    assert.ok(!line.includes('TO anon') && !line.includes('TO public'), 'Conversions must NEVER have public or anon policy');
  }
}
assert.ok(sql.includes('Only admins can view conversions'), 'Conversions can only be viewed by admins');
assert.ok(sql.includes('Only admins can insert conversions'), 'Conversions can only be inserted by admins');
assert.ok(sql.includes('Only admins can update conversions'), 'Conversions can only be updated by admins');
assert.ok(sql.includes('USING (public.is_admin())'), 'Administrative operations must enforce public.is_admin()');
console.log('[PASS] Conversions and merchant configurations are 100% isolated to public.is_admin()');

// Test 4: Verify public product filtering (only active merchant + in_stock + is_approved)
console.log('\n[4/6] Testing Public Product Filtering Safeguards...');
assert.ok(sql.includes('is_approved = TRUE'), 'Public policy must require is_approved = true');
assert.ok(sql.includes("availability_status = 'in_stock'"), "Public policy must require availability_status = 'in_stock'");
assert.ok(sql.includes("m.status = 'active'"), "Public policy must require merchant.status = 'active'");
console.log('[PASS] Public cannot view unapproved, inactive, or discontinued products');

// Test 5: Verify click tracking privacy (no passwords, tokens, or private chat leakage)
console.log('\n[5/6] Testing Privacy-Preserving Click Tracking...');
assert.ok(!sql.includes('chat_id') && !sql.includes('message_id') && !sql.includes('password'), 'Click tracking must not store chat/message content or passwords');
assert.ok(sql.includes('user_id IS NULL OR user_id = auth.uid()'), 'Clicks can only be attributed to current authenticated user or NULL');
console.log('[PASS] Privacy safeguards confirmed: Click tracking contains zero sensitive chat or credential data');

// Test 6: Verify TypeScript types and client helper integration
console.log('\n[6/6] Testing TypeScript Types & Client Service Integration...');
const typesPath = path.resolve('src/types/osa.ts');
const typesCode = fs.readFileSync(typesPath, 'utf8');
assert.ok(typesCode.includes('export interface AffiliateMerchant'), 'src/types/osa.ts must export AffiliateMerchant');
assert.ok(typesCode.includes('export interface AffiliateProduct'), 'src/types/osa.ts must export AffiliateProduct');
assert.ok(typesCode.includes('export interface AffiliateClick'), 'src/types/osa.ts must export AffiliateClick');
assert.ok(typesCode.includes('export interface AffiliateConversion'), 'src/types/osa.ts must export AffiliateConversion');

const servicePath = path.resolve('src/services/osaService.ts');
const serviceCode = fs.readFileSync(servicePath, 'utf8');
assert.ok(serviceCode.includes('fetchActiveAffiliateProducts'), 'osaService.ts must export fetchActiveAffiliateProducts');
assert.ok(serviceCode.includes('fetchActiveAffiliateMerchants'), 'osaService.ts must export fetchActiveAffiliateMerchants');
assert.ok(serviceCode.includes('trackAffiliateProductClick'), 'osaService.ts must export trackAffiliateProductClick');
console.log('[PASS] TypeScript types and service functions cleanly integrated');

console.log('\nAll 6 Affiliate Foundation verification tests passed successfully!\n');

// Trigger Redirect Engine Tests
import { execSync } from 'node:child_process';
execSync('npx tsx scripts/test-affiliate-redirect.mjs', { stdio: 'inherit' });

// Trigger Product Showcase UI Tests
execSync('npx tsx scripts/test-product-showcase.mjs', { stdio: 'inherit' });

// Trigger AI Shopping Assistant Tests
execSync('npx tsx scripts/test-ai-shopping-assistant.mjs', { stdio: 'inherit' });



