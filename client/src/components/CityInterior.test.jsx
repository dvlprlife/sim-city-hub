import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import CityInterior from './CityInterior.jsx';

const people = [
  { id: 'dev', name: 'Devon', job: 'Developer', icon: 'developer', defaultModel: 'sonnet' },
  { id: 'qa', name: 'Quinn', job: 'Tester', icon: 'tester', defaultModel: 'haiku' },
];
const html = (props) =>
  renderToStaticMarkup(<CityInterior cityId="c1" people={people} onSelectPerson={() => {}} {...props} />);

describe('CityInterior status emotes', () => {
  it('shows a tool bubble for a running citizen with a tool emote', () => {
    const out = html({
      personCounts: { dev: { running: 1 } },
      emotes: { dev: { kind: 'tool', text: 'Edit' } },
    });
    expect(out).toContain('emote-bubble tool');
    expect(out).toContain('🔧');
    expect(out).toContain('Edit');
    expect(out).not.toContain('think-bubble'); // the tool bubble replaces the dots
  });

  it('falls back to the thinking dots while running with no tool emote', () => {
    const out = html({ personCounts: { dev: { running: 1 } }, emotes: {} });
    expect(out).toContain('think-bubble');
    expect(out).not.toContain('emote-bubble');
  });

  it('pops a coin and a summary bubble when a run finishes', () => {
    const out = html({ emotes: { dev: { kind: 'done', text: 'fixed the reconnect bug' } } });
    expect(out).toContain('emote-bubble done');
    expect(out).toContain('fixed the reconnect bug');
    expect(out).toContain('coin-pop');
    expect(out).toContain('✓');
  });

  it('shows an error emote (no coin) when a run errors', () => {
    const out = html({ emotes: { dev: { kind: 'error', text: 'spawn failed' } } });
    expect(out).toContain('emote-bubble error');
    expect(out).toContain('❗');
    expect(out).toContain('spawn failed');
    expect(out).not.toContain('coin-pop');
  });

  it('renders no emote markup for an idle desk', () => {
    const out = html({});
    expect(out).not.toContain('emote-bubble');
    expect(out).not.toContain('coin-pop');
    expect(out).not.toContain('think-bubble');
  });
});
