# Change Log

All notable changes to the "julia-cell-highlighter" extension will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [0.1.4] - 2026-02-06

### Changed
- Documentation: update README.

## [0.1.3] - 2026-01-26

### Changed
- Decouple separator refresh scheduling from cell highlighting refresh.
- Stop refreshing separator lines on cursor moves.

### Fixed
- Separator lines no longer refresh in non-Julia files.

## [0.1.2] - 2026-01-24

### Changed
- Delete Run Cell commands from the command palette.
- Add bounded exponential backoff when Julia commands are not yet available (max interval 60s, max attempts 8).

### Fixed
- CodeLens now recovers when the Julia extension activates after the editor opens.

## [0.1.1] - 2026-01-23

### Changed
- Lower VS Code engine requirement to 1.60 and align @types/vscode.
- Cache configuration parsing and Julia command availability to reduce overhead.
- Optimize CodeLens generation and reuse cached delimiter index for Run Cell.

## [0.1.0] - 2026-01-23

### Added
- Initial release.

[Unreleased]: https://github.com/abcdvvvv/julia-cell-highlighter/compare/v0.1.4...HEAD
[0.1.4]: https://github.com/abcdvvvv/julia-cell-highlighter/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/abcdvvvv/julia-cell-highlighter/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/abcdvvvv/julia-cell-highlighter/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/abcdvvvv/julia-cell-highlighter/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/abcdvvvv/julia-cell-highlighter/releases/tag/v0.1.0
