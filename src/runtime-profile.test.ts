import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAutoRegisterCommands,
  parseRuntimeProfile,
  validateRuntimeProfile
} from './runtime-profile.js';

test('runtime profiles fail closed at the native/slash-only boundaries', () => {
  assert.equal(parseRuntimeProfile(undefined), 'headless');
  assert.equal(parseRuntimeProfile('NATIVE'), 'native');
  assert.equal(parseAutoRegisterCommands(undefined, 'slash-only'), false);
  assert.equal(parseAutoRegisterCommands(undefined, 'headless'), true);
  assert.equal(parseAutoRegisterCommands('false', 'native'), false);
  assert.doesNotThrow(() => validateRuntimeProfile('headless', false, null));
  assert.doesNotThrow(() => validateRuntimeProfile('native', true, 'native-owner'));
  assert.throws(() => validateRuntimeProfile('native', false, 'native-owner'), /native requires/);
  assert.throws(() => validateRuntimeProfile('slash-only', true, null), /slash-only cannot/);
  assert.throws(() => validateRuntimeProfile('slash-only', false, 'owner'), /slash-only cannot/);
});

test('unknown runtime profiles are rejected instead of silently selecting a mode', () => {
  assert.throws(() => parseRuntimeProfile('desktop-web'), /INVALID_RUNTIME_PROFILE/);
});
