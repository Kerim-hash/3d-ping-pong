import { Game } from './src/game.js';

window.addEventListener('DOMContentLoaded', () => {
  const game = new Game(document.getElementById('app'));
  window.__game = game; // handy for debugging in the console
});
