# audioport — Build Report

MCP Rebuild 100. Clean-room rebuild of the "audio-tools" target,
which is a FILL-IN in TARGETS.json (`source_repo: null`): the
5-tool spec was defined for this program from the common public
audio-tools MCP pattern (metadata, convert, trim, normalize,
transcribe-info) and is labelled as such in the fixture. Local
build only — nothing pushed or published.

Identity: repo `audioport`, npm `@reneturcios/audioport`,
MCP name `io.github.CloudCorpRecords/audioport`, version `0.1.0`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json` — bin `audioport: dist/cli.js`, `mcpName` set,
  scripts build=`tsc` / dev=`tsx src/cli.ts` / test=`tsx --test test/*.test.ts`
- `server.json` — description "Audio metadata, conversion,
  trimming, normalization, and transcription via ffmpeg." =
  **82 chars** (≤100 ✓, verified programmatically); npm entry
  carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/audioport:0.1.0` carries **no**
  `version` field (verified programmatically)
- `Dockerfile` — node:20-alpine two-stage, ENTRYPOINT
  `node /app/dist/cli.js`, CMD `mcp`, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/audioport"`.
  The base image bundles **no ffmpeg/ffprobe** (see gaps)
- `tsconfig.json` (identical to the fleet template), `.gitignore`,
  `LICENSE` (MIT, Copyright (c) 2026 Rene Turcios), `README.md`
  (fresh text), `CHANGELOG.md` (single 0.1.0 entry, 2026-10-26)
- `src/index.ts`, `src/cli.ts` (`metadata`, `convert`, `trim`,
  `normalize`, `transcribe`, `mcp`, `--version`; exit 2 usage /
  1 processing error), `src/mcp.ts`, `src/types.ts`,
  `src/audioport.ts` (core logic, `VERSION = "0.1.0"`)
- `test/audioport.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (from the fleet template via modelrun; image name and smoke-test
  server name changed to audioport)

## Tools implemented (5)

`get_audio_metadata`, `convert_audio`, `trim_audio`,
`normalize_audio`, `transcribe_audio` — the full defined fill-in
set, as recorded in the fixture `_source`.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with explicit
  inputSchema literals, per the standing fleet rule: `McpServer`'s
  zod-to-JSON-Schema conversion injects `$schema` /
  `additionalProperties` keys that are absent from the defined spec
  and break exact schema parity. Zod still validates every
  `tools/call`.
- Processing is behind an injectable `ExecutorFn`
  (`(command, args) => Promise<{stdout, stderr}>`, execFile arg
  arrays, no shell). `get_audio_metadata` runs ffprobe with
  `-v quiet -print_format json -show_format -show_streams`, parses
  the JSON, picks the first `codec_type: "audio"` stream (error
  "no audio stream found" when there is none), and reports `null`
  for any field ffprobe did not provide — values are never
  invented. `convert_audio` lowercases and validates the format
  against the documented set (mp3, wav, ogg, flac, aac, m4a),
  replaces the output extension with the format when it differs,
  and adds `-b:a <bitrate>` only when a bitrate is given.
  `trim_audio` validates `start >= 0` and `duration > 0` and builds
  `-ss` / optional `-t` args. `normalize_audio` applies `-af
  loudnorm`. Executor rejections are wrapped as
  `audio executor failed: <msg>`.
- **Transcription is never faked.** It is delegated to an
  injectable `TranscriberFn`; the result passes the engine's text
  through, with the caller's language hint winning over the
  engine-reported language in the result. The default transcriber
  is NOT configured: with `AUDIOPORT_TRANSCRIBER_COMMAND` unset or
  blank it throws an error naming that variable. When the variable
  is set, it is split on whitespace into a command plus arguments,
  run via the same execFile helper with the input path appended,
  and its trimmed stdout is the transcript. No other API key
  exists and no network call is made.

## Verification (foreground, exact outputs)

### 1. Build
```
$ ./node_modules/.bin/tsc ; echo exit=$?
tsc exit=0
```
`dist/` produced, including `dist/cli.js` with `.d.ts` / `.js.map`.

### 2. Tests
```
$ ./node_modules/.bin/tsx --test test/*.test.ts
ℹ tests 12
ℹ pass 12
ℹ fail 0
```
Covers: metadata parsing from canned ffprobe JSON (all fields:
format mp3, duration 62.5, bitRate 192000, sampleRate 44100,
channels 2 — plus the exact ffprobe arg array); the
no-audio-stream error; convert args with bitrate on and off,
extension replacement (`.ogg` output + format `MP3` → `.mp3`, and
the lowercased format in the result), and the bad-format error
raised before any execution; trim args with and without duration,
the negative-start error, and the non-positive-duration error;
normalize loudnorm args; transcribe with a fake transcriber
(asserting text pass-through and that the language hint is
forwarded to the engine, plus the engine-language fallback when
no hint is given); the default transcriber without the env var
erroring and naming `AUDIOPORT_TRANSCRIBER_COMMAND`; and executor
rejections wrapped as `audio executor failed: <msg>`.

### 3. CLI / MCP smoke
`--version` → `0.1.0`; no-args exits 2 with Usage. MCP
`initialize` over stdio → `serverInfo: {"name":"audioport",
"version":"0.1.0"}`. A `tools/call` for `transcribe_audio` with
`AUDIOPORT_TRANSCRIBER_COMMAND` unset returned `isError: true`
with text "no transcription engine configured: set
AUDIOPORT_TRANSCRIBER_COMMAND to a local transcription command
(it is run with the audio file path as its last argument) and
retry".

**Real ffmpeg/ffprobe run (this VM has both binaries):**
`which ffmpeg ffprobe` → `/usr/bin/ffmpeg`, `/usr/bin/ffprobe`
(ffmpeg 8.1.2). A 2-second 440 Hz sine WAV was generated with
ffmpeg (`-f lavfi -i sine=frequency=440:duration=2 -ar 22050
-ac 1`), and `node dist/cli.js metadata` on it returned
`{"input": "/tmp/audioport-smoke.wav", "format": "wav",
"duration": 2, "bitRate": 353112, "sampleRate": 22050,
"channels": 1}` with exit 0 — a genuine end-to-end metadata call
against the default executor, not a fake.

### 4. Parity (harness, from ~/workspace/mcp-rebuild-100/harness/)
```
$ python3 parity.py --original fixtures/audio-tools-tools-original.json \
    --rebuild "stdio:node .../builds/audioport/dist/cli.js mcp" \
    --out .../builds/audioport/parity-out
verdict=PASS parity_pct=100.0 original_tools=5 rebuild_tools=5 missing=[] extra=[] schema_diffs=[]
(exit 0)
```
(parity.json: identical_tools 5/5.) Original side is tools-file
mode, so `fixture_results` records `SKIPPED-TOOLS-FILE-MODE` —
expected harness semantics, not an error.

## Lockfile status

`package-lock.json` was copied from modelrun's and its identity
fields edited (top-level `name`, root package `name`, root package
`bin` key → audioport; dependency ranges are identical, so the
tree is unchanged). **Clean lockfile regen required before
publish** (regenerate with no `node_modules` present); do not
publish from this lockfile as-is. `node_modules` here is a copy
of modelrun's; `.bin/tsc` / `.bin/tsx` verified working after a
chmod fix on the copied `.bin`.

## Gaps / honest notes

- Fill-in target: audio-tools has `source_repo: null` in
  TARGETS.json and no original server exists to probe; parity
  proves the rebuild matches this program's defined spec,
  labelled fill-in in the fixture `_source`.
- A live ffmpeg/ffprobe run WAS performed in this VM (both
  binaries are installed) — one real metadata call on a generated
  file, reported in Verification §3 above. The other processing
  tools' happy paths are covered by fake-executor arg-construction
  tests only; no real convert/trim/normalize output file was
  produced or claimed.
- The container image bundles no ffmpeg/ffprobe, so containerised
  audioport passes only the initialize/usage smoke; processing in
  a container needs a derived image with ffmpeg installed. Same
  class as repoport gap 10 / videokit gap 25.
- Transcription depends on an operator-configured local engine —
  none is configured by default, by design. No live transcription
  was performed or claimed; the configured-command path is the
  documented execFile contract, exercised only through the
  missing-engine error here.
- mcpaudit / mcpvet / shipcheck pre-publish gate not run — publish
  wave scope, not claimed here.
