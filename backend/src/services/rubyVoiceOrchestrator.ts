import OpenAI from 'openai';
import { toFile } from 'openai/uploads';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
} from 'openai/resources/chat/completions';
import { appendMessages, type RubySession } from './rubySessionStore';
import { executeRubyTool, type ToolMutationFlags } from './rubyTaskEventTools';

const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1';
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
const TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'tts-1';
const TTS_VOICE = (process.env.OPENAI_TTS_VOICE || 'alloy') as
  | 'alloy'
  | 'echo'
  | 'fable'
  | 'onyx'
  | 'nova'
  | 'shimmer';

function getClient(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  return new OpenAI({ apiKey: key });
}

export function buildRubySystemPrompt(firstName: string, timeZone: string): string {
  const tz = timeZone || 'UTC';
  return `You are Ruby, a concise, friendly, action-oriented voice assistant for UniFlow.

User first name: ${firstName}
User timezone (IANA): ${tz}. Use it for "today", "tomorrow", and interpreting dates like "next Friday" into YYYY-MM-DD for tools.

Rules:
- The app already played your spoken introduction to the user at session start. Do not repeat that full greeting unless they ask; continue naturally.
- When describing plans, completion, or schedules, ONLY use data returned from your tools (get_day_overview, create_task, etc.). Never invent tasks or events.
- For calendar events, the create_event tool requires title, time, and date (YYYY-MM-DD). If the user wants an event but has not given a time (or date), ask ONE short clarifying question instead of calling create_event.
- Prefer create_task for day goals and errands ("go to the gym today"). Prefer create_event when the user gives a specific time or explicit calendar language.
- After successfully creating or updating something, confirm in one short sentence.
- Keep spoken replies brief and natural.`;
}

const RUBY_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_day_overview',
      description:
        'Get tasks and events for a calendar day in the user timezone. Tasks are those due or created on that day (matching the mobile home "today" logic). Events are filtered by date string.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Date as YYYY-MM-DD in the user timezone. Omit for today.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Create a task for the user.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'critical'] },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
          dueDate: { type: 'string', description: 'ISO 8601 datetime optional' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: 'Update an existing task by id.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'critical'] },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
          dueDate: { type: 'string', description: 'ISO datetime or empty to clear' },
        },
        required: ['taskId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_event',
      description:
        'Create a calendar event. Requires title, time (user-visible string e.g. "15:00" or "3:00 PM"), and date YYYY-MM-DD.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          time: { type: 'string' },
          date: { type: 'string', description: 'YYYY-MM-DD' },
          priority: { type: 'string', enum: ['low', 'medium', 'critical'] },
        },
        required: ['title', 'time', 'date'],
      },
    },
  },
];

export interface RubyVoiceTurnResult {
  transcript: string;
  message: string;
  audioBase64: string;
  audioMimeType: string;
  sessionId: string;
  mutations: { tasks: boolean; events: boolean };
  debug?: { toolRounds: number };
}

async function transcribeAudio(
  client: OpenAI,
  buffer: Buffer,
  originalname: string,
  mimetype: string
): Promise<string> {
  const file = await toFile(buffer, originalname || 'audio.webm', { type: mimetype || 'application/octet-stream' });
  const result = await client.audio.transcriptions.create({
    file,
    model: TRANSCRIBE_MODEL,
  });
  return (result.text || '').trim();
}

async function synthesizeSpeech(client: OpenAI, text: string): Promise<{ base64: string; mime: string }> {
  const cleaned = text.trim() || "I didn't catch that.";
  const response = await client.audio.speech.create({
    model: TTS_MODEL,
    voice: TTS_VOICE,
    input: cleaned.slice(0, 4000),
    response_format: 'mp3',
  });
  const buf = Buffer.from(await response.arrayBuffer());
  return { base64: buf.toString('base64'), mime: 'audio/mpeg' };
}

export async function runRubyVoiceTurn(params: {
  session: RubySession;
  audioBuffer?: Buffer;
  audioOriginalname?: string;
  audioMimetype?: string;
  forcedTranscript?: string;
  includeDebug?: boolean;
}): Promise<RubyVoiceTurnResult> {
  const client = getClient();
  const { session } = params;

  let transcript: string;
  if (params.forcedTranscript !== undefined && params.forcedTranscript !== '') {
    transcript = params.forcedTranscript.trim();
  } else if (params.audioBuffer && params.audioBuffer.length > 0) {
    transcript = await transcribeAudio(
      client,
      params.audioBuffer,
      params.audioOriginalname || 'audio.webm',
      params.audioMimetype || 'audio/webm'
    );
  } else {
    throw new Error('No audio or transcript provided');
  }

  if (!transcript) {
    transcript = '(silence or unclear audio)';
  }

  const userMessage: ChatCompletionMessageParam = { role: 'user', content: transcript };
  appendMessages(session, [userMessage]);

  const mutations: ToolMutationFlags = { tasks: false, events: false };
  let toolRounds = 0;
  const maxToolIterations = 8;

  for (let i = 0; i < maxToolIterations; i++) {
    const completion = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: session.messages,
      tools: RUBY_TOOLS,
      tool_choice: 'auto',
      temperature: 0.5,
    });

    const choice = completion.choices[0];
    const msg = choice?.message;
    if (!msg) break;

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      toolRounds += 1;
      const assistantToolMsg: ChatCompletionMessageParam = {
        role: 'assistant',
        content: msg.content,
        tool_calls: msg.tool_calls,
      };
      appendMessages(session, [assistantToolMsg]);

      const toolMsgs: ChatCompletionToolMessageParam[] = [];
      for (const tc of msg.tool_calls) {
        const fn = tc.function;
        let args: Record<string, unknown> = {};
        try {
          args = fn.arguments ? (JSON.parse(fn.arguments) as Record<string, unknown>) : {};
        } catch {
          args = {};
        }
        const content = await executeRubyTool(fn.name, args, session.userId, session.timezone, mutations);
        toolMsgs.push({
          role: 'tool',
          tool_call_id: tc.id,
          content,
        });
      }
      appendMessages(session, toolMsgs);
      continue;
    }

    const text = msg.content?.trim() || 'Okay.';
    appendMessages(session, [{ role: 'assistant', content: text }]);
    const { base64, mime } = await synthesizeSpeech(client, text);

    return {
      transcript,
      message: text,
      audioBase64: base64,
      audioMimeType: mime,
      sessionId: session.id,
      mutations: { tasks: mutations.tasks, events: mutations.events },
      ...(params.includeDebug ? { debug: { toolRounds } } : {}),
    };
  }

  const fallback = 'I ran into a loop processing that. Please try again.';
  appendMessages(session, [{ role: 'assistant', content: fallback }]);
  const { base64, mime } = await synthesizeSpeech(client, fallback);
  return {
    transcript,
    message: fallback,
    audioBase64: base64,
    audioMimeType: mime,
    sessionId: session.id,
    mutations: { tasks: mutations.tasks, events: mutations.events },
    ...(params.includeDebug ? { debug: { toolRounds } } : {}),
  };
}

export async function runRubyGreeting(firstName: string): Promise<{
  message: string;
  audioBase64: string;
  audioMimeType: string;
}> {
  const client = getClient();
  const message = `Hey ${firstName}, I'm Ruby, your AI assistant. I help you plan your day and stay on track. What do you want to achieve today?`;
  const { base64, mime } = await synthesizeSpeech(client, message);
  return { message, audioBase64: base64, audioMimeType: mime };
}
