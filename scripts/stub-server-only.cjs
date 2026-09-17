// Lets scripts import server-only modules outside Next.js (server-only becomes a no-op).
const Module = require("node:module");
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") return require.resolve("./empty.cjs");
  return orig.call(this, request, ...rest);
};
