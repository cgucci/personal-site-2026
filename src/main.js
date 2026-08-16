// main.js
//
// Vite's entry point (referenced from index.html). All this does is boot the
// Game — everything else lives under src/game/.
import './style.css';
import { Game } from './game/Game.js';

const game = new Game();
game.start();
