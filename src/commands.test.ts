import test from 'node:test';
import assert from 'node:assert/strict';
import { commandDefinitions } from './commands.js';
import { CommandRegistrationError } from './command-registration.js';

type CommandOption = {
  name: string;
  type?: number;
  description?: string;
  min_value?: number;
  max_value?: number;
  max_length?: number;
  required?: boolean;
  choices?: Array<{ name: string; value: string }>;
  options?: CommandOption[];
};

test('community slash command contract exposes bounded leaderboard pages and confirmed reset', () => {
  const leaderboard = commandDefinitions.find((command) => command.name === 'leaderboard');
  const leaderboardPage = (leaderboard?.options as unknown as CommandOption[] | undefined)?.find((option) => option.name === 'page');
  assert.equal(leaderboardPage?.type, 4);
  assert.equal(leaderboardPage?.min_value, 1);
  assert.equal(leaderboardPage?.max_value, 100);

  const communityConfig = commandDefinitions.find((command) => command.name === 'community-config');
  const subcommands = communityConfig?.options as unknown as CommandOption[] | undefined ?? [];
  assert.ok(subcommands.some((subcommand) => subcommand.name === 'cooldown'));
  assert.ok(subcommands.some((subcommand) => subcommand.name === 'xp-multiplier'));
  assert.ok(subcommands.some((subcommand) => subcommand.name === 'role-multiplier'));
  assert.ok(subcommands.some((subcommand) => subcommand.name === 'role-reward'));
  const reset = subcommands.find((subcommand) => subcommand.name === 'reset');
  assert.equal(reset?.options?.find((option) => option.name === 'confirm')?.required, true);
  assert.equal(reset?.options?.find((option) => option.name === 'confirm')?.type, 5);
});

test('slash command registry keeps the approved command surface complete and unique', () => {
  const expected = [
    'ping', 'bot', 'rank', 'leaderboard', 'community-config', 'join', 'play', 'search', 'info',
    'queue', 'now-playing', 'clear', 'remove', 'move', 'shuffle', 'repeat', 'equalizer',
    'playlist', 'music-access', 'previous', 'skip', 'pause', 'resume', 'volume', 'stop', 'leave'
  ];
  const actual = commandDefinitions.map((command) => command.name);
  assert.equal(new Set(actual).size, actual.length, 'slash command names must be unique');
  assert.deepEqual([...actual].sort(), [...expected].sort());
});

test('bot operator command exposes safe status, diagnostics, audit, greetings, AutoMod, and sync actions', () => {
  const bot = commandDefinitions.find((command) => command.name === 'bot') as unknown as CommandOption;
  assert.deepEqual(bot.options?.map((option) => option.name), ['status', 'providers', 'diagnostics', 'sync', 'audit', 'greetings', 'automod']);

  const audit = bot.options?.find((option) => option.name === 'audit');
  assert.equal(audit?.type, 2);
  assert.deepEqual(audit?.options?.map((option) => option.name), ['local', 'discord']);
  assert.equal(audit?.options?.find((option) => option.name === 'local')?.options?.find((option) => option.name === 'limit')?.max_value, 10);

  const greetings = bot.options?.find((option) => option.name === 'greetings');
  assert.equal(greetings?.type, 2);
  assert.deepEqual(greetings?.options?.map((option) => option.name), ['show', 'set', 'preview']);
  const greetingSet = greetings?.options?.find((option) => option.name === 'set');
  assert.equal(greetingSet?.options?.find((option) => option.name === 'kind')?.required, true);
  assert.equal(greetingSet?.options?.find((option) => option.name === 'image_url')?.max_length, 2_048);
});

test('bot automod command exposes confirmed policy, bounded rule, review, and recovery controls', () => {
  const bot = commandDefinitions.find((command) => command.name === 'bot') as unknown as CommandOption;
  const automod = bot.options?.find((option) => option.name === 'automod');
  assert.equal(automod?.type, 2);
  assert.deepEqual(automod?.options?.map((option) => option.name), ['show', 'policy', 'rule', 'domain', 'exempt', 'review', 'decide', 'recover']);

  const policy = automod?.options?.find((option) => option.name === 'policy');
  assert.equal(policy?.options?.find((option) => option.name === 'enabled')?.required, true);
  assert.equal(policy?.options?.find((option) => option.name === 'mode')?.required, true);
  assert.equal(policy?.options?.find((option) => option.name === 'confirm')?.required, true);

  const rule = automod?.options?.find((option) => option.name === 'rule');
  assert.equal(rule?.options?.find((option) => option.name === 'threshold')?.min_value, 2);
  assert.equal(rule?.options?.find((option) => option.name === 'window')?.max_value, 86_400);

  const review = automod?.options?.find((option) => option.name === 'review');
  assert.equal(review?.options?.find((option) => option.name === 'limit')?.max_value, 10);
  const recovery = automod?.options?.find((option) => option.name === 'recover');
  assert.equal(recovery?.options?.find((option) => option.name === 'confirm')?.required, true);
});

test('slash command definitions stay Discord-safe before registration', () => {
  const visit = (options: readonly CommandOption[], path: string): void => {
    const names = options.map((option) => option.name);
    assert.equal(new Set(names).size, names.length, `${path} option names must be unique`);

    let optionalSeen = false;
    for (const option of options) {
      assert.match(option.name, /^[a-z0-9_-]{1,32}$/, `${path}.${option.name} has an invalid Discord name`);
      assert.ok(option.description && option.description.length <= 100, `${path}.${option.name} needs a bounded description`);
      assert.ok(
        option.min_value === undefined || option.max_value === undefined || option.min_value <= option.max_value,
        `${path}.${option.name} has an invalid numeric range`
      );
      if (option.required) {
        assert.equal(optionalSeen, false, `${path}.${option.name} is required after an optional option`);
      } else if (option.type !== undefined && option.type !== 1 && option.type !== 2) {
        optionalSeen = true;
      }
      if (option.choices) {
        assert.ok(option.choices.length > 0 && option.choices.length <= 25, `${path}.${option.name} has too many choices`);
        const choiceValues = option.choices.map((choice) => choice.value);
        assert.equal(new Set(choiceValues).size, choiceValues.length, `${path}.${option.name} choice values must be unique`);
      }
      if (option.options) visit(option.options, `${path}.${option.name}`);
    }
  };

  for (const command of commandDefinitions as unknown as CommandOption[]) {
    assert.match(command.name, /^[a-z0-9_-]{1,32}$/);
    assert.ok(command.description && command.description.length <= 100, `${command.name} needs a bounded description`);
    if (command.options) visit(command.options, command.name);
  }
});

test('music slash commands expose the complete provider and playback mode contract', () => {
  const command = (name: string) => commandDefinitions.find((item) => item.name === name) as unknown as CommandOption;
  const option = (name: string, optionName: string) => command(name).options?.find((item) => item.name === optionName);

  assert.deepEqual(option('play', 'source')?.choices?.map((choice) => choice.value), ['youtube', 'soundcloud']);
  assert.deepEqual(option('search', 'source')?.choices?.map((choice) => choice.value), ['youtube', 'soundcloud', 'all']);
  assert.deepEqual(option('repeat', 'mode')?.choices?.map((choice) => choice.value), ['off', 'all', 'one']);
  assert.equal(option('volume', 'percent')?.min_value, 0);
  assert.equal(option('volume', 'percent')?.max_value, 100);
  assert.equal(option('remove', 'position')?.min_value, 1);
  assert.equal(option('move', 'from')?.min_value, 1);
  assert.equal(option('move', 'to')?.min_value, 1);
});

test('slash registration failures expose only stable retry metadata', () => {
  const transient = new CommandRegistrationError(429);
  assert.equal(transient.httpStatus, 503);
  assert.equal(transient.retryable, true);
  assert.match(transient.message, /Discord/);
  assert.doesNotMatch(transient.message, /429|token|payload|authorization/i);

  const permission = new CommandRegistrationError(403);
  assert.equal(permission.httpStatus, 502);
  assert.equal(permission.retryable, false);

  const unknown = new CommandRegistrationError(null);
  assert.equal(unknown.httpStatus, 503);
  assert.equal(unknown.retryable, true);
});
