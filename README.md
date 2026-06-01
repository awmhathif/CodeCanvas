# CodeCanvas

A curated gallery of **single-file HTML experiments** and a few small multi-file demos—built to explore ideas quickly in the browser with no build step.

Each project is self-contained: open the `.html` file locally and it runs.

## Repository layout

```
CodeCanvas/
├── projects/
│   ├── 2024/ … 2026/     # grouped by year (from file metadata; approximate)
│   │   ├── games/
│   │   ├── tools/
│   │   ├── animations/
│   │   ├── audio/
│   │   ├── visualizers/
│   │   └── …
│   └── multi-file/       # HTML + CSS + JS bundles (e.g. finance, audio tools)
├── docs/
│   ├── catalog.md        # searchable index (repo paths only)
│   └── manifest.json     # machine-readable index (no local disk paths)
└── LICENSE
```

## Quick start

1. Clone the repo.
2. Pick a year and category under `projects/`.
3. Double-click any `.html` file (or serve the folder with any static server).

No `npm install`, no bundler required for the single-file apps.

## What’s in the collection

| Category | Examples |
|----------|----------|
| **games** | Snake, platformers, puzzles, focus trainers, 3D mini-games |
| **tools** | Code editor, image editor, notes, password managers, habit trackers |
| **audio** | Pianos, synths, ambient mixers, Web Audio experiments |
| **animations** | Particle systems, generative art, glitch effects |
| **visualizers** | Quantum/cosmic demos, simulations, creative coding sketches |
| **utilities** | Clocks, weather cards, converters |

See **[docs/catalog.md](docs/catalog.md)** for the full list (~286 single-file apps).

## Multi-file projects

Under `projects/multi-file/`, a handful of demos split markup, styles, and scripts—the same “open and run” idea, but easier to maintain for larger UIs.

## Notes on dates

Year folders use the file’s **last-modified** timestamp on disk. Copying or re-saving a file can move an older experiment into a newer year folder—that’s a filesystem limitation, not the original build date.

## Contributing

This is a personal archive and playground. If you fork it:

- Keep the single-file spirit where possible.
- Use clear filenames derived from the page `<title>`.
- Avoid committing secrets, API keys, or large binary assets.

## License

[MIT](LICENSE) — use, modify, and share with attribution.
