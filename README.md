# audioport

audioport does everyday audio work on local files. It reads the
facts ffprobe reports about a file — its format, duration, bit rate,
sample rate, and channel count — converts between the common audio
formats, cuts a segment out of a file starting at a chosen second,
and normalizes loudness with ffmpeg's loudnorm filter. A fifth tool
transcribes, but only through a transcription engine you configure
yourself; audioport bundles no engine and invents no transcripts.

All processing runs through the `ffmpeg` and `ffprobe` binaries on
the machine, invoked with argument arrays (never a shell), so those
binaries must be installed for the processing tools to work. When
they are missing, the binary's own error is returned instead of a
made-up result.

## Transcription

Transcription is delegated to a local command named by the
`AUDIOPORT_TRANSCRIBER_COMMAND` environment variable. The command is
run with the audio file path as its last argument, and its stdout
is the transcript. For example:

```bash
export AUDIOPORT_TRANSCRIBER_COMMAND="whisper-cli --model base"
```

When the variable is unset, `transcribe` and the `transcribe_audio`
tool fail with an error naming `AUDIOPORT_TRANSCRIBER_COMMAND`.
There is no API key, no hosted service, and no fallback that
guesses at the words.

## Install

```bash
npx @reneturcios/audioport metadata song.mp3
```

Or run the container image:

```bash
docker run -i ghcr.io/cloudcorprecords/audioport
```

The container defaults to the MCP server (see below) and bundles no
ffmpeg/ffprobe; use a host install, or a derived image with ffmpeg
installed, for the processing tools. Pass CLI arguments to use it
as a CLI instead.

## CLI

```bash
audioport metadata song.mp3
audioport convert song.wav song-out.mp3 mp3 --bitrate 192k
audioport trim song.mp3 clip.mp3 5 --duration 10
audioport normalize song.wav song-normalized.wav
audioport transcribe song.mp3 --language en

audioport --version
```

The `convert` command writes to the output path with its extension
replaced by the target format when they differ (converting
`song-out.ogg` to mp3 writes `song-out.mp3`). Supported formats:
mp3, wav, ogg, flac, aac, m4a.

Each command prints its result as JSON. Exit codes: `0` on success,
`1` when processing fails (including a missing transcription
engine), `2` for usage errors.

## MCP server

One bin serves both faces. The `mcp` subcommand starts a stdio MCP
server:

```bash
npx -y @reneturcios/audioport mcp
```

MCP client configuration:

```json
{
  "mcpServers": {
    "audioport": {
      "command": "npx",
      "args": ["-y", "@reneturcios/audioport", "mcp"],
      "env": { "AUDIOPORT_TRANSCRIBER_COMMAND": "whisper-cli --model base" }
    }
  }
}
```

### Tools

| Tool | Input | What it returns |
| --- | --- | --- |
| `get_audio_metadata` | `input` (required) | Format, duration in seconds, bit rate, sample rate, and channels; fields ffprobe did not provide are null. |
| `convert_audio` | `input`, `output`, `format` (required), `bitrate` (optional) | The effective output path (extension follows the format), format, and bit rate. |
| `trim_audio` | `input`, `output`, `start` (required), `duration` (optional) | The output path, start second, and duration. |
| `normalize_audio` | `input`, `output` (required) | The input and output paths, after a loudnorm pass. |
| `transcribe_audio` | `input` (required), `language` (optional) | The transcript from the configured engine, or an error naming `AUDIOPORT_TRANSCRIBER_COMMAND` when none is configured. |

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # node test runner over test/*.test.ts, fake executors only
npm run dev     # run the CLI from source via tsx
```

## License

MIT — see `LICENSE`.
