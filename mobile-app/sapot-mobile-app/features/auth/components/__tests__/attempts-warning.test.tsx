import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { AttemptsWarning } from '../attempts-warning';

// useTheme is mocked globally in jest-setup.js; no Provider wrapper needed.
const renderWarning = (ui: React.ReactElement) => render(ui);

describe('AttemptsWarning', () => {
  it('renders the attempts count', () => {
    renderWarning(<AttemptsWarning attemptsRemaining={3} />);
    expect(screen.getByText(/3 attempt/i)).toBeTruthy();
  });

  it('renders singular "attempt" when 1 remaining', () => {
    renderWarning(<AttemptsWarning attemptsRemaining={1} />);
    expect(screen.getByText(/1 attempt remaining/i)).toBeTruthy();
  });

  it('renders plural "attempts" when more than 1 remaining', () => {
    renderWarning(<AttemptsWarning attemptsRemaining={5} />);
    expect(screen.getByText(/5 attempts remaining/i)).toBeTruthy();
  });

  it('does not render when attemptsRemaining is 0', () => {
    const { queryByTestId } = renderWarning(
      <AttemptsWarning attemptsRemaining={0} />
    );
    expect(queryByTestId('attempts-warning')).toBeNull();
  });
});
