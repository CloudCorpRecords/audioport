# Changelog

## 0.1.0 (2026-10-26)

- Initial release.
- CLI: `audioport metadata|convert|trim|normalize|transcribe`
  and `audioport mcp`; processing runs the local ffmpeg/ffprobe
  binaries through an injectable executor (execFile arg arrays, no
  shell).
- MCP server (`audioport mcp`, stdio) with five tools:
  `get_audio_metadata`, `convert_audio`, `trim_audio`,
  `normalize_audio`, and `transcribe_audio`.
- `get_audio_metadata` parses ffprobe's JSON output and reports
  null for any field ffprobe did not provide — values are never
  invented.
- `convert_audio` accepts mp3, wav, ogg, flac, aac, and m4a, with
  an optional bit rate; the output extension is replaced with the
  target format when it differs.
- `normalize_audio` applies ffmpeg's loudnorm filter.
- Transcription is behind an injectable engine. No engine is
  configured by default: the default transcriber runs the local
  command named by `AUDIOPORT_TRANSCRIBER_COMMAND` when set, and
  otherwise fails with an error naming that variable. No
  transcript is ever fabricated and no API key is used.
