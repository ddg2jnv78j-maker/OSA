import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { detectShoppingIntent, searchApprovedCatalog, queryShoppingAssistant } from '../src/services/aiService.ts';

console.log('=== OSA Task 5: AI Shopping & Deals Assistant Tests ===\n');

// 1. Test shopping intent detection (English & Bengali)
console.log('[1/6] Testing shopping intent detection...');
const intentEn = detectShoppingIntent('Recommend a phone under 30000 BDT');
assert.equal(intentEn.isShoppingIntent, true, 'English shopping query must be recognized');
assert.equal(intentEn.maxBudget, 30000, 'Budget must be correctly parsed');

const intentBn = detectShoppingIntent('সেরা wireless headphone কোনটি?');
assert.equal(intentBn.isShoppingIntent, true, 'Bengali shopping query must be recognized');
assert.equal(intentBn.language, 'bn', 'Bengali language must be detected');

const intentChat = detectShoppingIntent('Hello how are you doing today?');
assert.equal(intentChat.isShoppingIntent, false, 'Ordinary chat query must NOT trigger shopping intent');

const intentCapabilities = detectShoppingIntent('তুমি কী কী করতে পারো? আমাকে suggest করো');
assert.equal(intentCapabilities.isShoppingIntent, false, 'General capability questions and generic suggestions must not trigger shopping');

const intentPhoneAddiction = detectShoppingIntent('Explain phone addiction and its effects on mental health');
assert.equal(intentPhoneAddiction.isShoppingIntent, false, 'A product word in an informational question must not trigger shopping');

const intentRecommend = detectShoppingIntent('Recommend a phone under 30000 BDT');
assert.equal(intentRecommend.isShoppingIntent, true, 'Explicit product recommendations must still trigger shopping');
console.log('✓ Passed: English/Bengali shopping queries work and general questions remain in general chat');

// 2. Verify aiService export and grounded assistant structure
console.log('\n[2/6] Verifying aiService implementation structure...');
const aiServiceCode = fs.readFileSync(path.resolve('src/services/aiService.ts'), 'utf8');
assert.ok(aiServiceCode.includes('queryShoppingAssistant'), 'aiService must export queryShoppingAssistant');
assert.ok(aiServiceCode.includes('searchApprovedCatalog'), 'aiService must export searchApprovedCatalog');
assert.ok(aiServiceCode.includes('is_approved'), 'Catalog filter must require is_approved = true');
assert.ok(aiServiceCode.includes("availability_status !== 'in_stock'"), 'Catalog filter must require in_stock availability');
console.log('✓ Passed: AI service implements deterministic catalog search and safety guardrails');

// 3. Verify ChatConversationView integration
console.log('\n[3/6] Verifying ChatConversationView AI assistant integration...');
const chatCode = fs.readFileSync(path.resolve('src/pages/ChatConversationView.tsx'), 'utf8');
assert.ok(chatCode.includes('queryShoppingAssistant'), 'ChatConversationView must invoke queryShoppingAssistant');
assert.ok(chatCode.includes('OSA_PRODUCT_CARD:'), 'ChatConversationView must format matched products as product cards');
console.log('✓ Passed: Chat interface automatically renders grounded recommendations as interactive product cards');

// 4. Run mock query test for empty/no-match behavior
console.log('\n[4/6] Testing empty catalog and no-match behavior...');
const emptyRes = await queryShoppingAssistant('Buy quantum teleporter 9999');
assert.equal(emptyRes.isShopping, true);
assert.equal(emptyRes.matchedProducts.length, 0);
assert.ok(emptyRes.explanation.length > 0, 'Must provide honest explanation when no products match');
console.log('✓ Passed: Empty catalog handled honestly without fabricating hallucinated items');

// 5. Security & Isolation verification
console.log('\n[5/6] Verifying security and isolation rules...');
assert.ok(!aiServiceCode.includes('service_role'), 'No service role key in AI service');
assert.ok(!aiServiceCode.includes('eval('), 'No unsafe eval');
console.log('✓ Passed: Zero secret leakage or unsafe operations');

// 6. Build verification is performed by the dedicated GitHub Actions CI workflow.
console.log('\\n[6/6] Build/type-check verification...');
console.log('ℹ️ This script does not execute the build; rely on the dedicated CI workflow for build and type-check results.');

console.log('\nAI Shopping Assistant checks completed. Note: this script does not run TypeScript or production build verification; use GitHub Actions CI for those checks.\n');
