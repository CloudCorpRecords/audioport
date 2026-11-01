/**
 * audioport types.
 *
 * Local audio processing runs through ffmpeg/ffprobe. Execution is
 * described by an ExecutorFn: a command name plus an argument array
 * (execFile semantics, never a shell string), resolving with the
 * captured stdout/stderr. Transcription is described separately by
 * a TranscriberFn so the engine is pluggable and testable; no
 * transcription engine is bundled or assumed.
 */

/** Result of running an external command. */
export interface ExecutorResult {
  stdout: string;
  stderr: string;
}

/** Runs a command with an argument array; resolves with its output. */
export type ExecutorFn = (
  command: string,
  args: string[],
) => Promise<ExecutorResult>;

/** Transcribes an audio file, optionally with a language hint. */
export type TranscriberFn = (
  input: string,
  language?: string,
) => Promise<{ text: string; language?: string }>;

/** What a transcription engine returns. */
export interface Transcription {
  text: string;
  language?: string;
}

export interface GetAudioMetadataOptions {
  input: string;
}

export interface ConvertAudioOptions {
  input: string;
  output: string;
  format: string;
  bitrate?: string;
}

export interface TrimAudioOptions {
  input: string;
  output: string;
  start: number;
  duration?: number;
}

export interface NormalizeAudioOptions {
  input: string;
  output: string;
}

export interface TranscribeAudioOptions {
  input: string;
  language?: string;
}

/** Parsed metadata for one audio file. Fields ffprobe did not provide are null. */
export interface AudioMetadata {
  input: string;
  format: string | null;
  duration: number | null;
  bitRate: number | null;
  sampleRate: number | null;
  channels: number | null;
}

export interface ConvertAudioResult {
  input: string;
  output: string;
  format: string;
  bitrate: string | null;
}

export interface TrimAudioResult {
  input: string;
  output: string;
  start: number;
  duration: number | null;
}

export interface NormalizeAudioResult {
  input: string;
  output: string;
}

export interface TranscribeAudioResult {
  input: string;
  text: string;
  language: string | null;
}
