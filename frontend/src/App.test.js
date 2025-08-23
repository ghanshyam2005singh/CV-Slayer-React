import { render, screen } from '@testing-library/react';
import App from './App';

// Mock admin route to prevent routing issues in tests
Object.defineProperty(window, 'location', {
  value: {
    pathname: '/'
  },
  writable: true
});

test('renders CV Slayer app', () => {
  render(<App />);
  const titleElement = screen.getByText(/CV Slayer/i);
  expect(titleElement).toBeInTheDocument();
});

test('renders upload section', () => {
  render(<App />);
  const uploadText = screen.getByText(/Upload Your Resume/i);
  expect(uploadText).toBeInTheDocument();
});

test('renders roast button', () => {
  render(<App />);
  const roastButton = screen.getByText(/Roast My Resume/i);
  expect(roastButton).toBeInTheDocument();
});

// Production safety test
test('app does not crash on render', () => {
  expect(() => {
    render(<App />);
  }).not.toThrow();
});