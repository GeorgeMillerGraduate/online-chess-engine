# Third-party notices

- **Stockfish.js 18.0.0**, Nathan Rugg, Chess.com and Stockfish contributors: GPLv3. Unmodified `stockfish-18-lite-single.js` and matching `.wasm` were copied from the pinned npm package. GPL text is in projects/chess/stockfish/LICENSE.txt. Corresponding upstream source commit reported by the npm package: `3f5d4d17bee569cbec41d5f6abed23717eb17c01`.
  - Project: https://github.com/nmrugg/stockfish.js
  - Exact source: https://github.com/nmrugg/stockfish.js/tree/3f5d4d17bee569cbec41d5f6abed23717eb17c01
  - Source archive: https://codeload.github.com/nmrugg/stockfish.js/tar.gz/3f5d4d17bee569cbec41d5f6abed23717eb17c01
  - An exact source archive is also included at projects/chess/stockfish/stockfish-source.tar.gz (and third-party-source/ in the full package). Keep the engine licence and access to corresponding source when redistributing the engine. Upstream source contains its build instructions and related notices. The app's licence does not override GPL terms.
- **chess.js 1.4.0**, Jeff Hlywa and contributors: BSD-2-Clause. https://github.com/jhlywa/chess.js . The original licence is included in projects/chess/vendor/chess.LICENSE.
- **Socket.IO client 4.8.1**, Socket.IO contributors: MIT. https://github.com/socketio/socket.io . The browser licence is included in projects/chess/vendor/socket.io.LICENSE.
- **Express 5.1.0 and Socket.IO server 4.8.1** and their transitive dependencies are installed via npm with their own notices. See package-lock.json and installed dependency LICENSE files.
- **Lichess puzzle data:** CC0, https://database.lichess.org/#puzzles . Starter IDs: qcgKo, q6aC4, 00sHx, 00sJ9, 00sJb, 00sO1. Individual provenance is included in puzzles.json. The first two were retrieved through the public puzzle API; four are published database format examples. No affiliation with Lichess is claimed.
- **PNG chess pieces and Jenga Code branding:** the existing assets from https://jenga-code.com/projects/chess/images/ and https://jenga-code.com/images/ were recovered for this owner-requested update. Their original rights remain unchanged. They are not presented as newly created or covered by the app's MIT licence.
- The board renderer, layout, interactions and application code are custom implementation. No Lichess board renderer, logo, screenshots or CSS were copied.
