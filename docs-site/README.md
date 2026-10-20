# Agent Canvas docs

Independent Fumadocs / Next.js documentation site. No product runtime is needed.

```bash
npm ci
npm run dev
# http://127.0.0.1:4310
```

- `/`: Landing Page
- `/docs`: architecture wiki, module guides and review findings
- `/api/search`: full-text search over the same content
- `/architecture.html`: self-contained architecture map

Edit `../docs/architecture/wiki/`, not the generated `content/docs/` directory.
Content preparation fails on stale evidence rather than silently refreshing hashes.
Restart the dev command after changing wiki content. UI source changes hot-reload.

```bash
npm test
npm run typecheck
npm run build
npm start
```

See `../docs/architecture/wiki/maintenance.md` for the evidence review, analysis,
rendering and verification workflow. `architecture:analyze` invokes Knip 5 through
npx; ordinary builds and verification do not require Knip or contact the runtime.

The verifier and HTML template were copied from the architecture-wiki skill.
The verifier's coverage ledger also includes non-ignored untracked files, and the
oxc mapper enables automatic tsconfig resolution. No user files are staged.
