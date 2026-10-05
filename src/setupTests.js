// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// jsdom (used by CRA's Jest) lacks TextEncoder, which React Router v7 needs.
import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextEncoder, TextDecoder });
window.scrollTo = () => {};
Element.prototype.scrollIntoView = () => {};

// The React tests talk to an in-memory fake of the API instead of the server.
jest.mock('./api', () => require('./testing/fakeApi'));
beforeEach(() => {
  require('./api').__reset();
  localStorage.clear();
});

// Whole-app tests render the full site; on a busy machine (e.g. with the dev server running) a page can take
// more than Testing Library's 1 s default to appear, so allow longer before a query gives up.
require('@testing-library/react').configure({ asyncUtilTimeout: 5000 });
jest.setTimeout(30000);
