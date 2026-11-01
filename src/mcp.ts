/**
 * audioport MCP server. Tools: get_audio_metadata, convert_audio,
 * trim_audio, normalize_audio, transcribe_audio.
 *
 * Why the low-level Server instead of McpServer: the high-level helper
 * converts zod schemas to JSON Schema and injects keys that are not in
 * this tool's public spec ("$schema" and "additionalProperties"), which
 * breaks exact tool-list/schema parity with the spec. This file serves
 * tools/list with the spec's exact input schemas as explicit literals,
 * while zod still validates every tools/call argument set.
 *
 * Processing uses the default executor (real ffmpeg/ffprobe via
 * execFile) and the default transcriber, which is not configured by
 * default: transcribe_audio returns an honest isError naming
 * AUDIOPORT_TRANSCRIBER_COMMAND until an operator configures a local
 * transcription command. No transcript is ever invented.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
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

const MetadataArgs = z.object({ input: z.string() });
const ConvertArgs = z.object({
  input: z.string(),
  output: z.string(),
  format: z.string(),
  bitrate: z.string().optional(),
});
const TrimArgs = z.object({
  input: z.string(),
  output: z.string(),
  start: z.number(),
  duration: z.number().optional(),
});
const NormalizeArgs = z.object({ input: z.string(), output: z.string() });
const TranscribeArgs = z.object({
  input: z.string(),
  language: z.string().optional(),
});

const TOOLS = [
  {
    name: "get_audio_metadata",
    description:
      "Read metadata for an audio file: format, duration in seconds, bit rate, sample rate, and channels.",
    inputSchema: {
      type: "object" as const,
      properties: {
        input: {
          type: "string",
          description: "Path to the input audio file to read metadata from.",
        },
      },
      required: ["input"],
    },
  },
  {
    name: "convert_audio",
    description:
      "Convert an audio file to another format (mp3, wav, ogg, flac, aac, m4a), optionally at the given bit rate such as 192k.",
    inputSchema: {
      type: "object" as const,
      properties: {
        input: {
          type: "string",
          description: "Path to the input audio file to convert.",
        },
        output: {
          type: "string",
          description:
            "Path to write the converted audio file to; its extension is replaced with the target format if it differs.",
        },
        format: {
          type: "string",
          description: "Target audio format: one of mp3, wav, ogg, flac, aac, or m4a.",
        },
        bitrate: {
          type: "string",
          description: "Optional bit rate for the output audio, such as 192k.",
        },
      },
      required: ["input", "output", "format"],
    },
  },
  {
    name: "trim_audio",
    description:
      "Trim an audio file starting at the given second, optionally for the given duration in seconds.",
    inputSchema: {
      type: "object" as const,
      properties: {
        input: {
          type: "string",
          description: "Path to the input audio file to trim.",
        },
        output: {
          type: "string",
          description: "Path to write the trimmed audio file to.",
        },
        start: {
          type: "number",
          description: "Start time in seconds from which to trim the audio.",
        },
        duration: {
          type: "number",
          description:
            "Optional length in seconds of the trimmed output; when omitted, audio runs from start to the end of the file.",
        },
      },
      required: ["input", "output", "start"],
    },
  },
  {
    name: "normalize_audio",
    description:
      "Normalize an audio file's loudness with the loudnorm filter and write it to the output path.",
    inputSchema: {
      type: "object" as const,
      properties: {
        input: {
          type: "string",
          description: "Path to the input audio file to normalize.",
        },
        output: {
          type: "string",
          description: "Path to write the loudness-normalized audio file to.",
        },
      },
      required: ["input", "output"],
    },
  },
  {
    name: "transcribe_audio",
    description:
      "Transcribe an audio file with the configured transcription engine, optionally hinting the language. Returns an error when no engine is configured.",
    inputSchema: {
      type: "object" as const,
      properties: {
        input: {
          type: "string",
          description: "Path to the input audio file to transcribe.",
        },
        language: {
          type: "string",
          description:
            "Optional language hint for the transcription engine, such as a language code or name.",
        },
      },
      required: ["input"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "audioport", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const executor = createDefaultExecutor();
  const transcriber = createDefaultTranscriber();
  try {
    let out: unknown;
    if (name === "get_audio_metadata") {
      out = await getAudioMetadata(executor, MetadataArgs.parse(args ?? {}));
    } else if (name === "convert_audio") {
      out = await convertAudio(executor, ConvertArgs.parse(args ?? {}));
    } else if (name === "trim_audio") {
      out = await trimAudio(executor, TrimArgs.parse(args ?? {}));
    } else if (name === "normalize_audio") {
      out = await normalizeAudio(executor, NormalizeArgs.parse(args ?? {}));
    } else if (name === "transcribe_audio") {
      out = await transcribeAudio(transcriber, TranscribeArgs.parse(args ?? {}));
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(out);
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
