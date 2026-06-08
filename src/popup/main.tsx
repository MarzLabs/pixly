import { render } from 'preact';
import { PopupApp } from './PopupApp';

const root = document.getElementById('pixly-popup-root');

if (root) {
  render(<PopupApp />, root);
}
