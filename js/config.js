// Static hosting: set this to your HTTPS multiplayer server, e.g. https://chess-api.example.com.
// Empty means same origin (works when running the included Node server).
export const SERVER_URL = "https://chess-api.jenga-code.com";
export const ENGINE_URL = new URL(
  "../stockfish/stockfish-18-lite-single.js",
  import.meta.url,
).href;
