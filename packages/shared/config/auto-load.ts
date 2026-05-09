// Side-effect module: imports loadEnvFiles and calls it immediately.
//
// ESM hoists all imports to the top of a module, executing them in source
// order. So `import '@kloudi-os/shared/config/auto-load'` placed FIRST in an
// entry file guarantees .env is loaded before any later import's top-level
// code runs.
//
// Use this if your app needs .env loaded before any module — including
// transitive deps — reads process.env at import time.
//
// Walks up from the shared package's install directory. For server apps
// running in their project root or under node_modules, this finds the
// project's root .env. For CLI tools invoked from arbitrary user directories,
// use `auto-load-cwd` instead.

import { loadEnvFiles } from './index.js';

loadEnvFiles();
