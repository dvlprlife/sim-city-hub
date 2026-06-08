import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import HandoffCourier from './HandoffCourier.jsx';

const html = (name) => renderToStaticMarkup(<HandoffCourier name={name} />);

describe('HandoffCourier', () => {
  it('renders the click-through flight overlay with the paper plane', () => {
    const out = html('Ada');
    expect(out).toContain('courier-fx'); // fixed full-screen overlay
    expect(out).toContain('courier-plane'); // the plane svg
    expect(out).toContain('<path'); // plane geometry, not an emoji
  });

  it('labels the courier with the receiving citizen', () => {
    expect(html('Ada Builder')).toContain('Ada Builder');
    // Falls back to whatever id App passes when there's no display name.
    expect(html('mayors-aide')).toContain('mayors-aide');
  });
});
