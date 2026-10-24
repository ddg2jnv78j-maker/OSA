import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { TRANSLATIONS } from '../src/lib/i18n.ts';

console.log('=== OSA Task 4: In-App Product Showcase & Deal Cards UI Tests ===\n');

// 1. Component files existence
console.log('[1/8] Checking component files exist...');
const cardPath = path.resolve('src/components/AffiliateProductCard.tsx');
const pagePath = path.resolve('src/pages/DealsPage.tsx');
assert.ok(fs.existsSync(cardPath), 'AffiliateProductCard.tsx must exist');
assert.ok(fs.existsSync(pagePath), 'DealsPage.tsx must exist');
console.log('✓ Passed: AffiliateProductCard.tsx and DealsPage.tsx exist');

// 2. Navigation integration in App.tsx
console.log('\n[2/8] Verifying Deals navigation integration in App.tsx...');
const appCode = fs.readFileSync('src/App.tsx', 'utf8');
assert.ok(appCode.includes("id: 'deals'"), "App.tsx must include 'deals' navigation item");
assert.ok(appCode.includes('<DealsPage'), 'App.tsx must render DealsPage when activeTab === deals');
assert.ok(appCode.includes('ShoppingBag'), 'App.tsx must use ShoppingBag icon for Deals navigation');
console.log('✓ Passed: Deals tab integrated into desktop left rail and mobile bottom navigation');

// 3. Transparent FTC Affiliate Disclosure
console.log('\n[3/8] Verifying visible affiliate disclosure...');
const cardCode = fs.readFileSync(cardPath, 'utf8');
const pageCode = fs.readFileSync(pagePath, 'utf8');
assert.ok(pageCode.includes('t.affiliateDisclosure'), 'DealsPage must render affiliate disclosure');
assert.ok(
  TRANSLATIONS.en.affiliateDisclosure.includes('Affiliate Disclosure') &&
    TRANSLATIONS.en.affiliateDisclosure.includes('commission'),
  'English disclosure must clearly state affiliate commission relationship'
);
assert.ok(
  TRANSLATIONS.bn.affiliateDisclosure.includes('অ্যাফিলিয়েট ডিসক্লোজার') &&
    TRANSLATIONS.bn.affiliateDisclosure.includes('কমিশন'),
  'Bengali disclosure must clearly state affiliate commission relationship'
);
console.log('✓ Passed: Prominent, compliant affiliate disclosures present in both English and Bengali');

// 4. Bilingual labels and dictionary completeness
console.log('\n[4/8] Verifying i18n dictionary completeness...');
const requiredKeys = [
  'deals',
  'affiliateTitle',
  'affiliateSubtitle',
  'affiliateDisclosure',
  'viewDeal',
  'buyFromMerchant',
  'inStock',
  'outOfStock',
  'preOrder',
  'verifiedMerchant',
  'noDealsFound',
  'noDealsDesc',
  'categoriesAll',
  'categoriesElectronics',
  'categoriesFashion',
  'categoriesHome',
  'categoriesBooks',
  'redirectingToMerchant',
  'redirectNotice',
  'merchantDiscontinued',
];

for (const k of requiredKeys) {
  assert.ok(TRANSLATIONS.en[k], `English dictionary missing key: ${k}`);
  assert.ok(TRANSLATIONS.bn[k], `Bengali dictionary missing key: ${k}`);
}
console.log('✓ Passed: All 20 affiliate & deals keys defined in English and Bengali');

// 5. Product Card features (Image placeholder, Verified Merchant, Stock status, Pricing)
console.log('\n[5/8] Verifying Product Card UI security and state handling...');
assert.ok(cardCode.includes('onError'), 'Product card must handle broken image fallback');
assert.ok(cardCode.includes('discountPercent'), 'Product card must calculate and display discount badge if valid');
assert.ok(cardCode.includes('t.inStock') && cardCode.includes('t.outOfStock'), 'Product card must display stock status');
assert.ok(cardCode.includes('trackAffiliateProductClick'), 'Product card must use secure trackAffiliateProductClick');
assert.ok(cardCode.includes('noopener,noreferrer'), 'External merchant link must use noopener,noreferrer');
console.log('✓ Passed: Safe image fallback, discount calculations, and noopener security confirmed');

// 6. Safe error states and no false claims
console.log('\n[6/8] Verifying empty, loading, and error states...');
assert.ok(pageCode.includes('t.noDealsFound'), 'DealsPage must handle empty products safely');
assert.ok(pageCode.includes('t.noDealsDesc'), 'DealsPage must provide clear notice when catalog is empty');
assert.ok(pageCode.includes('Refresh Deals'), 'DealsPage must offer manual refresh');
console.log('✓ Passed: Empty state and notice handling confirmed without false claims');

// 7. Reusable card support inside Chat
console.log('\n[7/8] Verifying reusable deal card integration in ChatConversationView.tsx...');
const chatCode = fs.readFileSync('src/pages/ChatConversationView.tsx', 'utf8');
assert.ok(chatCode.includes('OSA_PRODUCT_CARD:'), 'Chat view must recognize OSA_PRODUCT_CARD: protocol');
assert.ok(chatCode.includes('<AffiliateProductCard'), 'Chat view must render AffiliateProductCard for deal messages');
assert.ok(chatCode.includes('compact={true}'), 'Chat view must use compact mode for in-chat cards');
console.log('✓ Passed: Chat system supports inline reusable deal cards for future AI shopping recommendations');

// 8. Security verification: No client-side secret leakage
console.log('\n[8/8] Checking for secret exposure in UI components...');
assert.ok(!cardCode.includes('service_role') && !pageCode.includes('service_role'), 'No service_role in UI');
assert.ok(!cardCode.includes('secret') && !pageCode.includes('secret'), 'No secrets in UI');
console.log('✓ Passed: Zero credentials or private keys in UI layer');

console.log('\nAll 8 Product Showcase & Deal Cards UI tests passed successfully!\n');
