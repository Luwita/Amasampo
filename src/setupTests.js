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
