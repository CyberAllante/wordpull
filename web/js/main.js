import { Game } from './game.js';

const game = new Game(document.getElementById('app'));
// test / debug hooks
window.__wp = game;

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
