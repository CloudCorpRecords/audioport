import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  convertAudio,
  createDefaultTranscriber,
  getAudioMetadata,
  normalizeAudio,
  transcribeAudio,
  trimAudio,
} from "../src/audioport.js";
import type { ExecutorFn, TranscriberFn } from "../src/types.js";

const PROBE_JSON = JSON.stringify({
  streams: [
    { codec_type: "video", codec_name: "h264", width: 640, height: 360 },
    {
      codec_type: "audio",
      codec_name: "mp3",
      sample_rate: "44100",
      channels: 2,
      duration: "61.0",
      bit_rate: "128000",
    },
  ],
  format: {
    format_name: "mp3",
    duration: "62.5",
    bit_rate: "192000",
    size: "1500000",
  },
});

interface Call {
  command: string;
  args: string[];
}

function fakeExecutor(stdout = ""): { fn: ExecutorFn; calls: Call[] } {
  const calls: Call[] = [];
  const fn: ExecutorFn = async (command, args) => {
    calls.push({ command, args });
    return { stdout, stderr: "" };
  };
  return { fn, calls };
}

describe("get_audio_metadata", () => {
  it("parses canned ffprobe JSON into all fields with exact ffprobe args", async () => {
    const { fn, calls } = fakeExecutor(PROBE_JSON);
    const info = await getAudioMetadata(fn, { input: "/tmp/song.mp3" });
    assert.equal(info.input, "/tmp/song.mp3");
    assert.equal(info.format, "mp3");
    assert.equal(info.duration, 62.5);
    assert.equal(info.bitRate, 192000);
    assert.equal(info.sampleRate, 44100);
    assert.equal(info.channels, 2);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, "ffprobe");
    assert.deepEqual(calls[0].args, [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      "/tmp/song.mp3",
    ]);
  });

  it("errors when there is no audio stream", async () => {
    const { fn } = fakeExecutor(
      JSON.stringify({
        streams: [{ codec_type: "video", codec_name: "h264" }],
        format: { format_name: "mov,mp4", duration: "3" },
      }),
    );
    await assert.rejects(
      () => getAudioMetadata(fn, { input: "/tmp/clip.mp4" }),
      /no audio stream found/,
    );
  });
});

describe("convert_audio", () => {
  it("builds ffmpeg args with bitrate and replaces the output extension with the format", async () => {
    const { fn, calls } = fakeExecutor();
    const out = await convertAudio(fn, {
      input: "/tmp/song.wav",
      output: "/tmp/song.ogg",
      format: "MP3",
      bitrate: "192k",
    });
    assert.equal(out.output, "/tmp/song.mp3");
    assert.equal(out.format, "mp3");
    assert.equal(out.bitrate, "192k");
    assert.equal(calls[0].command, "ffmpeg");
    assert.deepEqual(calls[0].args, [
      "-y",
      "-i",
      "/tmp/song.wav",
      "-b:a",
      "192k",
      "/tmp/song.mp3",
    ]);
  });

  it("omits the bitrate flag when none is given and keeps a matching extension", async () => {
    const { fn, calls } = fakeExecutor();
    const out = await convertAudio(fn, {
      input: "/tmp/song.mp3",
      output: "/tmp/song.flac",
      format: "flac",
    });
    assert.equal(out.output, "/tmp/song.flac");
    assert.equal(out.bitrate, null);
    assert.deepEqual(calls[0].args, ["-y", "-i", "/tmp/song.mp3", "/tmp/song.flac"]);
  });

  it("rejects a format outside the documented set before any execution", async () => {
    const { fn, calls } = fakeExecutor();
    await assert.rejects(
      () => convertAudio(fn, { input: "/tmp/a.mp3", output: "/tmp/a.xyz", format: "xyz" }),
      /unsupported audio format/,
    );
    assert.equal(calls.length, 0);
  });
});

describe("trim_audio", () => {
  it("builds seek args with a duration limit", async () => {
    const { fn, calls } = fakeExecutor();
    const out = await trimAudio(fn, {
      input: "/tmp/a.mp3",
      output: "/tmp/b.mp3",
      start: 5,
      duration: 10,
    });
    assert.deepEqual(calls[0].args, [
      "-y",
      "-ss",
      "5",
      "-i",
      "/tmp/a.mp3",
      "-t",
      "10",
      "/tmp/b.mp3",
    ]);
    assert.equal(out.start, 5);
    assert.equal(out.duration, 10);
  });

  it("omits -t without a duration and rejects a negative start or bad duration", async () => {
    const { fn, calls } = fakeExecutor();
    const out = await trimAudio(fn, { input: "/tmp/a.mp3", output: "/tmp/b.mp3", start: 0 });
    assert.deepEqual(calls[0].args, ["-y", "-ss", "0", "-i", "/tmp/a.mp3", "/tmp/b.mp3"]);
    assert.equal(out.duration, null);
    await assert.rejects(
      () => trimAudio(fn, { input: "/tmp/a.mp3", output: "/tmp/b.mp3", start: -1 }),
      /start must be >= 0/,
    );
    await assert.rejects(
      () => trimAudio(fn, { input: "/tmp/a.mp3", output: "/tmp/b.mp3", start: 1, duration: 0 }),
      /duration must be > 0/,
    );
  });
});

describe("normalize_audio", () => {
  it("builds the loudnorm filter args", async () => {
    const { fn, calls } = fakeExecutor();
    const out = await normalizeAudio(fn, { input: "/tmp/a.wav", output: "/tmp/a-norm.wav" });
    assert.equal(calls[0].command, "ffmpeg");
    assert.deepEqual(calls[0].args, [
      "-y",
      "-i",
      "/tmp/a.wav",
      "-af",
      "loudnorm",
      "/tmp/a-norm.wav",
    ]);
    assert.deepEqual(out, { input: "/tmp/a.wav", output: "/tmp/a-norm.wav" });
  });
});

describe("transcribe_audio", () => {
  it("returns the fake transcriber's text and forwards the language hint", async () => {
    const seen: Array<{ input: string; language?: string }> = [];
    const fake: TranscriberFn = async (input, language) => {
      seen.push({ input, language });
      return { text: "hello from the fake engine", language: "en" };
    };
    const out = await transcribeAudio(fake, { input: "/tmp/a.mp3", language: "es" });
    assert.equal(out.text, "hello from the fake engine");
    assert.equal(out.input, "/tmp/a.mp3");
    // The caller's hint wins in the result; the hint reached the engine.
    assert.equal(out.language, "es");
    assert.deepEqual(seen, [{ input: "/tmp/a.mp3", language: "es" }]);
  });

  it("falls back to the engine-reported language when no hint is given", async () => {
    const fake: TranscriberFn = async () => ({ text: "bonjour", language: "fr" });
    const out = await transcribeAudio(fake, { input: "/tmp/a.mp3" });
    assert.equal(out.text, "bonjour");
    assert.equal(out.language, "fr");
  });

  it("default transcriber without configuration errors naming AUDIOPORT_TRANSCRIBER_COMMAND", async () => {
    const saved = process.env.AUDIOPORT_TRANSCRIBER_COMMAND;
    delete process.env.AUDIOPORT_TRANSCRIBER_COMMAND;
    try {
      const transcriber = createDefaultTranscriber();
      await assert.rejects(() => transcriber("/tmp/a.mp3"), /AUDIOPORT_TRANSCRIBER_COMMAND/);
    } finally {
      if (saved !== undefined) process.env.AUDIOPORT_TRANSCRIBER_COMMAND = saved;
    }
  });
});

describe("executor failures", () => {
  it("wraps an executor rejection as an audio executor failure", async () => {
    const failing: ExecutorFn = async () => {
      throw new Error("spawn ffprobe ENOENT");
    };
    await assert.rejects(
      () => getAudioMetadata(failing, { input: "/tmp/a.mp3" }),
      /audio executor failed: spawn ffprobe ENOENT/,
    );
    await assert.rejects(
      () => normalizeAudio(failing, { input: "/tmp/a.wav", output: "/tmp/b.wav" }),
      /audio executor failed:/,
    );
  });
});
