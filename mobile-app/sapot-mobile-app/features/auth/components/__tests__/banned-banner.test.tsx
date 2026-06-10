import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { BannedBanner } from '../banned-banner';

// useTheme is mocked globally in jest-setup.js; no Provider wrapper needed.
const renderBanner = (ui: React.ReactElement) => render(ui);

describe('BannedBanner', () => {
  it('renders the ban message', () => {
    renderBanner(<BannedBanner message="Account banned until: 2026-06-11 12:00 UTC" />);
    expect(screen.getByText('Account banned until: 2026-06-11 12:00 UTC')).toBeTruthy();
  });

  it('renders with a short fallback message', () => {
    renderBanner(<BannedBanner message="Your account is currently banned." />);
    expect(screen.getByText('Your account is currently banned.')).toBeTruthy();
  });

  it('renders the container with testID', () => {
    const { getByTestId } = renderBanner(
      <BannedBanner message="Account banned until: 2026-06-11 12:00 UTC" />
    );
    expect(getByTestId('banned-banner')).toBeTruthy();
  });
});
