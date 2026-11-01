/**
 * audioport core: five local audio tools.
 *
 *   get_audio_metadata  ffprobe JSON probe, parsed
 *   convert_audio       ffmpeg transcode (extension follows format)
 *   trim_audio          ffmpeg seek + optional duration
 *   normalize_audio     ffmpeg loudnorm filter
 *   transcribe_audio    delegated to an injectable TranscriberFn
 *
 * Processing goes through an injectable ExecutorFn (execFile arg
 * arrays, no shell), so argument construction — the real logic — is
 * fully testable with a fake executor. The default executor spawns
 * the real ffmpeg/ffprobe binaries and surfaces their errors.
 *
 * Transcription is deliberately NOT faked: no engine is bundled and
 * no result is ever invented. The default transcriber only runs a
 * local command the operator points AUDIOPORT_TRANSCRIBER_COMMAND
 * at; when that variable is unset it returns an honest error naming
 * the variable. There is no API key and no network call.
 */
import { execFile } from "node:child_process";
import type {
  AudioMetadata,
  ConvertAudioOptions,
  ConvertAudioResult,
  ExecutorFn,
  ExecutorResult,
  GetAudioMetadataOptions,
  NormalizeAudioOptions,
  NormalizeAudioResult,
  TranscribeAudioOptions,
  TranscribeAudioResult,
  TranscriberFn,
  TrimAudioOptions,
  TrimAudioResult,
} from "./types.js";

export const VERSION = "0.1.0";

/** Environment variable that points at a local transcription command. */
export const TRANSCRIBER_COMMAND_ENV = "AUDIOPORT_TRANSCRIBER_COMMAND";

/** Formats convert_audio accepts, as documented. */
export const SUPPORTED_FORMATS = ["mp3", "wav", "ogg", "flac", "aac", "m4a"] as const;

/**
 * Runs a command via execFile (arg array, no shell). Failures are
 * wrapped as `audio executor failed: <msg>`, preferring the last
 * lines of stderr, which is where ffmpeg/ffprobe explain themselves.
 */
export function runExecFile(command: string, args: string[]): Promise<ExecutorResult> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { timeout: 300000, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const detail =
            (stderr || "").trim().split("\n").slice(-3).join("\n").trim() || err.message;
          reject(new Error(`audio executor failed: ${detail}`));
          return;
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

/** The default executor: real ffmpeg/ffprobe via execFile. */
export function createDefaultExecutor(): ExecutorFn {
  return (command, args) => runExecFile(command, args);
}

async function exec(executor: ExecutorFn, command: string, args: string[]): Promise<ExecutorResult> {
  try {
    return await executor(command, args);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("audio executor failed:")) throw err instanceof Error ? err : new Error(msg);
    throw new Error(`audio executor failed: ${msg}`);
  }
}

function need(value: string | undefined, field: string): string {
  if (!value) throw new Error(`${field} is required`);
  return value;
}

function numberOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Read metadata for an audio file via ffprobe's JSON output. */
export async function getAudioMetadata(
  executor: ExecutorFn,
  options: GetAudioMetadataOptions,
): Promise<AudioMetadata> {
  const input = need(options.input, "input");
  const { stdout } = await exec(executor, "ffprobe", [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    input,
  ]);
  let parsed: {
    streams?: Array<Record<string, unknown>>;
    format?: Record<string, unknown>;
  };
  try {
    parsed = JSON.parse(stdout) as typeof parsed;
  } catch {
    throw new Error(`ffprobe returned unparseable output for ${input}`);
  }
  const stream = (parsed.streams ?? []).find((s) => s.codec_type === "audio");
  if (!stream) throw new Error("no audio stream found");
  const format = parsed.format ?? {};
  return {
    input,
    format: typeof format.format_name === "string" ? format.format_name : null,
    duration: numberOrNull(format.duration ?? stream.duration),
    bitRate: numberOrNull(format.bit_rate ?? stream.bit_rate),
    sampleRate: numberOrNull(stream.sample_rate),
    channels: typeof stream.channels === "number" ? stream.channels : numberOrNull(stream.channels),
  };
}

/** Replace the extension of an output path with the target format. */
function withFormatExtension(output: string, format: string): string {
  const slash = output.lastIndexOf("/");
  const dot = output.lastIndexOf(".");
  if (dot > slash) {
    const current = output.slice(dot + 1).toLowerCase();
    if (current === format) return output;
    return `${output.slice(0, dot)}.${format}`;
  }
  return `${output}.${format}`;
}

/** Convert an audio file to another format, optionally at a bit rate. */
export async function convertAudio(
  executor: ExecutorFn,
  options: ConvertAudioOptions,
): Promise<ConvertAudioResult> {
  const input = need(options.input, "input");
  const output = need(options.output, "output");
  const rawFormat = need(options.format, "format");
  const format = rawFormat.toLowerCase();
  if (!(SUPPORTED_FORMATS as readonly string[]).includes(format)) {
    throw new Error(
      `unsupported audio format: ${rawFormat} (expected one of ${SUPPORTED_FORMATS.join(", ")})`,
    );
  }
  const effectiveOutput = withFormatExtension(output, format);
  const args = ["-y", "-i", input];
  if (options.bitrate) args.push("-b:a", options.bitrate);
  args.push(effectiveOutput);
  await exec(executor, "ffmpeg", args);
  return { input, output: effectiveOutput, format, bitrate: options.bitrate ?? null };
}

/** Trim an audio file starting at `start` seconds. */
export async function trimAudio(
  executor: ExecutorFn,
  options: TrimAudioOptions,
): Promise<TrimAudioResult> {
  const input = need(options.input, "input");
  const output = need(options.output, "output");
  if (typeof options.start !== "number" || !Number.isFinite(options.start)) {
    throw new Error("start is required");
  }
  if (options.start < 0) throw new Error("start must be >= 0");
  if (options.duration !== undefined && options.duration <= 0) {
    throw new Error("duration must be > 0");
  }
  const args = ["-y", "-ss", String(options.start), "-i", input];
  if (options.duration !== undefined) args.push("-t", String(options.duration));
  args.push(output);
  await exec(executor, "ffmpeg", args);
  return { input, output, start: options.start, duration: options.duration ?? null };
}

/** Normalize an audio file's loudness with the loudnorm filter. */
export async function normalizeAudio(
  executor: ExecutorFn,
  options: NormalizeAudioOptions,
): Promise<NormalizeAudioResult> {
  const input = need(options.input, "input");
  const output = need(options.output, "output");
  await exec(executor, "ffmpeg", ["-y", "-i", input, "-af", "loudnorm", output]);
  return { input, output };
}

/** Transcribe an audio file with the given transcription engine. */
export async function transcribeAudio(
  transcriber: TranscriberFn,
  options: TranscribeAudioOptions,
): Promise<TranscribeAudioResult> {
  const input = need(options.input, "input");
  const result = await transcriber(input, options.language);
  return {
    input,
    text: result.text,
    language: options.language ?? result.language ?? null,
  };
}

/**
 * The default transcriber. There is no bundled engine: when
 * AUDIOPORT_TRANSCRIBER_COMMAND is unset or blank the returned
 * function throws an error naming the variable — it never invents a
 * transcript. When the variable is set, its whitespace-split
 * command and arguments are run via execFile with the input path
 * appended, and stdout (trimmed) is the transcript.
 */
export function createDefaultTranscriber(): TranscriberFn {
  return async (input: string) => {
    const raw = process.env[TRANSCRIBER_COMMAND_ENV];
    const commandLine = typeof raw === "string" ? raw.trim() : "";
    if (!commandLine) {
      throw new Error(
        "no transcription engine configured: set AUDIOPORT_TRANSCRIBER_COMMAND to a local transcription command (it is run with the audio file path as its last argument) and retry",
      );
    }
    const [command, ...args] = commandLine.split(/\s+/);
    const { stdout } = await runExecFile(command, [...args, input]);
    return { text: stdout.trim() };
  };
}
