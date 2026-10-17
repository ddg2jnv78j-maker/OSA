// ============================================================================
// OSA — AUTONOMOUS AI AGENT ORCHESTRATION & PERMISSIONS TEST SUITE
// File: scripts/test-autonomous-agent.mjs
// ============================================================================

import assert from 'node:assert';
import { planAgentTask, executeAgentStep } from '../src/services/agentService.ts';

console.log('=== OSA Autonomous AI Agent & Tool Orchestration Tests ===\n');

// 1. Test task planning (English & Bengali)
console.log('[1/4] Testing agent task planning...');
const planEn = planAgentTask('Analyze codebase and run affiliate tests');
assert.ok(planEn.steps.length >= 3, 'Plan must contain multiple steps');
assert.ok(planEn.steps.some((s) => s.tool === 'run_tests'), 'Plan must include test execution step');

const planBnRes = planAgentTask('ক্যাটালগ সার্চ ও বিল্ড যাচাই করো');
assert.ok(planBnRes.steps.length >= 2, 'Bengali plan must contain steps');
console.log('✓ Passed: Agent planning successfully generates ordered steps for English and Bengali prompts');

// 2. Test step execution for catalog search
console.log('\n[2/4] Testing catalog search step execution...');
const mockStep = {
  stepNumber: 1,
  title: 'Search catalog',
  tool: 'search_catalog',
  args: { limit: 5 },
  status: 'pending',
};

const execRes = await executeAgentStep(mockStep);
assert.equal(execRes.success, true, 'Catalog search step must succeed');
assert.ok(execRes.output.length > 0, 'Step must return output');
console.log('✓ Passed: Catalog search step executed successfully');

// 3. Test step execution for type check and build
console.log('\n[3/4] Testing type check & build step execution...');
const typeCheckRes = await executeAgentStep({
  stepNumber: 2,
  title: 'Type check',
  tool: 'type_check',
  args: {},
  status: 'pending',
});
assert.equal(typeCheckRes.success, true);

const buildRes = await executeAgentStep({
  stepNumber: 3,
  title: 'Build app',
  tool: 'build_app',
  args: {},
  status: 'pending',
});
assert.equal(buildRes.success, true);
console.log('✓ Passed: Type check and build steps executed successfully');

// 4. Test security boundaries & unknown tool rejection
console.log('\n[4/4] Testing invalid/unknown tool rejection...');
const invalidRes = await executeAgentStep({
  stepNumber: 4,
  title: 'Invalid tool',
  tool: 'unknown_tool',
  args: {},
  status: 'pending',
});
assert.equal(invalidRes.success, false, 'Unknown tool must fail safely');
assert.ok(invalidRes.error, 'Must return error message for unknown tool');
console.log('✓ Passed: Unknown/unauthorized tool rejected safely');

console.log('\nAll Autonomous AI Agent & Tool Orchestration tests passed successfully!\n');
