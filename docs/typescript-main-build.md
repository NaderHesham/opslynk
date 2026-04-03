# TypeScript Main-Process Build Flow

This repository uses **incremental JS/TS interop** for Electron main-process migration.

## Scope
- TypeScript source:
  - `src/main/**/*.ts`
  - `src/shared/**/*.ts`
- Compiled output:
  - `dist-ts/`
- Runtime compatibility:
  - Existing JS shim files in `src/main/**/*.js` require compiled files from `dist-ts/`.

## Fresh Checkout Steps

```bash
npm install
npm run typecheck
npm run build:ts
npm start
```

## Scripts

- `npm run typecheck`
  - Runs TS validation only (`--noEmit`).
- `npm run build:ts`
  - Compiles TS main-process modules to `dist-ts/`.
- `npm start`
  - Uses `prestart` to compile TS first, then launches Electron.
- `npm run build`, `npm run build-msi`, `npm run build-portable`
  - Use prebuild hooks to compile TS before packaging.

## Why JS Shims Still Exist

The migration is incremental. JS shim modules keep current import/runtime behavior stable while TS modules are introduced gradually. This preserves behavior parity, including approved control features.

