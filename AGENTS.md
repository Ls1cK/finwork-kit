# AGENTS.md

## Project scope

- FinWork Kit is one npm package named @lz19.02/finwork-kit. It is not a workspace or monorepo.
- This repository maintains two deliverables: the npm library (UI, Agent detail and SSE tools) and its dumi documentation site.
- First-stage public entries are chat/core-sse, chat/core-detail, chat/ui and chat/style.css.
- Current functions and UI are scaffolding examples, not production SSE/detail/chat implementations.
- Future capabilities belong under their own domain namespace; do not aggregate UI into pure core entries.

## Source boundaries

- Library code belongs in src/. Core must not import React, DOM, CSS, application stores or docs code.
- UI consumes explicit props and callbacks. Do not add FinPlus services, routes, storage, analytics SDKs or business state.
- Documentation, usage examples and site assets belong in docs/. Do not create a separate demo app.
- Usage examples remain placeholders until Kit development and FinPlus migration tests are complete; then use the actual FinPlus integration as the example.
- Keep library and documentation build configuration and output separate.
- Documentation and AGENTS.md are versioned source. Generated site files, caches and credentials are not.

## Development rules

- Read the affected modules and consumers before changing interfaces; keep changes scoped to the request.
- Use apply_patch for manual edits. Do not run automatic formatting or lint fixes.
- Do not overwrite unrelated user changes or copy credentials/internal publishing configuration into this repository.
- Keep dependency versions pinned and commit pnpm-lock.yaml. Use pnpm 8.12.1.
- UI styles use CSS Modules + Less. Consumers should receive compiled CSS, not require a Less or source-alias setup.
- React/react-dom and their subpaths stay external. Maintain optional peer declarations and test linked consumers.
- Build/package changes must preserve actual exports, declaration paths, styles and file whitelist.

## Build and delivery contracts

- pnpm build / pnpm build:lib builds only the npm library into dist/.
- pnpm docs:build builds only the documentation site into site-dist/; it must not require, clean or rebuild dist/.
- Documentation uses public library imports mapped to src/ in both development and production builds. Only docs may depend on library code; library builds must not read docs or load dumi configuration.
- Configure npm publishing and static-site deployment in separate external pipelines.
- Do not add a publishing registry, token, release workflow or deployment workflow without an actual platform contract.
- Do not infer publishing behavior from another project. README.md is the source of truth for build commands and artifact directories.

## Validation

- Run the narrowest effective checks: typecheck, library export smoke tests, affected app builds and external-consumer checks.
- Run pnpm build:lib before pnpm verify:exports.
- For package changes, check npm tarball contents and an external consumer; source-alias demos do not prove package compatibility.
- Local development commands may be started when required to verify this scaffold; do not open browsers or perform browser automation unless explicitly requested.
- Do not report HTTP/startup/static-render checks as browser interaction validation.
- Report validation results, failures and untested environments in the delivery summary. Never claim internal registry/pipeline compatibility from public-registry testing.
