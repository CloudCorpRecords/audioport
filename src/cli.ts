#!/usr/bin/env node
/**
 * audioport CLI.
 *
 *   audioport metadata <input>
 *   audioport convert <input> <output> <format> [--bitrate b]
 *   audioport trim <input> <output> <start> [--duration d]
 *   audioport normalize <input> <output>
 *   audioport transcribe <input> [--language l]
 *   audioport mcp
 *   audioport --version
 *
 * Processing runs the local ffmpeg/ffprobe binaries. Transcription
 * runs the local command named by AUDIOPORT_TRANSCRIBER_COMMAND;
 * with none configured, `transcribe` fails naming that variable.
 * Exit codes: 0 success, 1 processing error, 2 usage error.
 */
import {
  convertAudio,
  createDefaultExecutor,
  createDefaultTranscriber,
  getAudioMetadata,
  normalizeAudio,
  transcribeAudio,
  trimAudio,
  VERSION,
} from "./audioport.js";

function usage(): never {
  console.error(`Usage:
  audioport metadata <input>
  audioport convert <input> <output> <format> [--bitrate b]
  audioport trim <input> <output> <start> [--duration d]
  audioport normalize <input> <output>
  audioport transcribe <input> [--language l]
  audioport mcp
  audioport --version`);
  process.exit(2);
}

function flagValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx < 0 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function withoutFlags(args: string[], valueFlags: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (valueFlags.includes(args[i])) i++;
    else out.push(args[i]);
  }
  return out;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }
  if (!cmd) usage();
  const known = ["metadata", "convert", "trim", "normalize", "transcribe"];
  if (!known.includes(cmd)) usage();
  const executor = createDefaultExecutor();
  const transcriber = createDefaultTranscriber();
  try {
    let out: unknown;
    if (cmd === "metadata") {
      const [input] = rest;
      if (!input) usage();
      out = await getAudioMetadata(executor, { input });
    } else if (cmd === "convert") {
      const pos = withoutFlags(rest, ["--bitrate"]);
      if (!pos[0] || !pos[1] || !pos[2]) usage();
      out = await convertAudio(executor, {
        input: pos[0],
        output: pos[1],
        format: pos[2],
        bitrate: flagValue(rest, "--bitrate"),
      });
    } else if (cmd === "trim") {
      const pos = withoutFlags(rest, ["--duration"]);
      if (!pos[0] || !pos[1] || pos[2] === undefined) usage();
      const durationRaw = flagValue(rest, "--duration");
      out = await trimAudio(executor, {
        input: pos[0],
        output: pos[1],
        start: Number(pos[2]),
        duration: durationRaw !== undefined ? Number(durationRaw) : undefined,
      });
    } else if (cmd === "normalize") {
      const [input, output] = rest;
      if (!input || !output) usage();
      out = await normalizeAudio(executor, { input, output });
    } else {
      const pos = withoutFlags(rest, ["--language"]);
      if (!pos[0]) usage();
      out = await transcribeAudio(transcriber, {
        input: pos[0],
        language: flagValue(rest, "--language"),
      });
    }
    console.log(JSON.stringify(out, null, 2));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
