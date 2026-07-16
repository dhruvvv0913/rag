import test from 'node:test'
import assert from 'node:assert/strict'
import { normalize, containsFact, factCoverage, retrievalRecall, average } from '../lib/eval-score.js'

test('normalize lowercases and collapses whitespace', () => {
  assert.equal(normalize('  Productivity  ROSE\n by 18   percent '), 'productivity rose by 18 percent')
})

test('containsFact matches across case and whitespace differences', () => {
  const text = 'The trial included\n214   Employees across three offices.'
  assert.ok(containsFact(text, '214 employees'))
  assert.ok(!containsFact(text, '500 employees'))
})

test('factCoverage returns the fraction of facts present', () => {
  const text = 'Productivity rose by 18 percent. Attrition fell from 14 percent to 6 percent.'
  assert.equal(factCoverage(text, ['18 percent', '14 percent', 'not there']), 2 / 3)
})

test('factCoverage with no expected facts is vacuously 1', () => {
  assert.equal(factCoverage('anything', []), 1)
})

test('retrievalRecall finds facts across separate chunks', () => {
  const chunks = ['The trial ran with 214 employees.', 'Productivity rose by 18 percent overall.']
  assert.equal(retrievalRecall(chunks, ['214 employees', '18 percent']), 1)
  assert.equal(retrievalRecall(chunks, ['214 employees', 'missing fact']), 0.5)
})

test('average of an empty list is 0', () => {
  assert.equal(average([]), 0)
  assert.equal(average([0.5, 1]), 0.75)
})
