// Side-effect module: loads .env starting from process.cwd() (current
// working directory of the running process).
//
// Use this for CLI tools where the user invokes the binary from arbitrary
// directories — they expect the .env adjacent to where they're standing,
// not next to the installed package.
//
// Like `auto-load`, this works correctly with ESM hoisting because side-
// effect imports are executed in source order before any non-import code.

import { loadEnvFiles } from './index.js';

loadEnvFiles({ startDir: process.cwd() });
