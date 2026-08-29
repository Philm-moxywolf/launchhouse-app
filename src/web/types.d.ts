/**
 * src/web/types.d.ts
 *
 * WHAT THIS IS. The two type libraries the browser half of the app needs, named in one
 * place instead of in tsconfig.web.json.
 *
 * WHY IT EXISTS. Two failures, both of which show up as a red `npm run build` that nobody
 * can explain from the error alone.
 *
 *   vite/client is what declares `import.meta.env`. Without it, any file that reads a build
 *   time flag fails to compile, and the error names `import.meta` rather than the missing
 *   type library.
 *
 *   node is here for two reasons that are easy to mistake for one. The component tests in
 *   this folder are run by node:test, the single runner this repository has, so they import
 *   `node:test` and `node:assert`. And `app/content/gates.ts`, which the Gates screen reads,
 *   imports its types from `app/content/gates-parse.ts`, which names `node:fs`. That import
 *   is a type only import, so Vite erases it and no Node code reaches the browser, but the
 *   typechecker still has to be able to resolve the module.
 *
 * WHAT READS IT. `tsc -p tsconfig.web.json`, which is the second half of `npm run build`.
 *
 * WHAT IT READS AND WRITES. Nothing. It is declarations.
 *
 * ONE WARNING. Node types in scope mean `process` compiles in browser code. It must never
 * be used here: there is no `process` in a browser, and the eslint rule that fires on
 * `process.env` covers `src/**` for exactly this reason. Anything the browser needs to know
 * about the environment arrives from the server in a response body.
 */

/// <reference types="vite/client" />
/// <reference types="node" />
