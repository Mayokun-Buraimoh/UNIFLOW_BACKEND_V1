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

/**
 * Compute YYYY-MM-DD and the weekday name (e.g. "Tuesday") for `now` in
 * the given IANA time zone. Used to anchor Ruby's understanding of "today",
 * "tomorrow", "next Friday", etc. — without this anchor the LLM has no
 * reliable clock and routinely mis-resolves relative dates.
 */
function dateAnchorInTimeZone(now: Date, timeZone: string): { ymd: string; weekday: string } {
  const tz = timeZone || 'UTC';
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
  }).format(now);
  return { ymd, weekday };
}

export function buildRubySystemPrompt(firstName: string, timeZone: string, now: Date = new Date()): string {
  const tz = timeZone || 'UTC';
  const { ymd, weekday } = dateAnchorInTimeZone(now, tz);
  return `You are Ruby, a concise, friendly, action-oriented voice assistant for UniFlow.

User first name: ${firstName}
User timezone (IANA): ${tz}.
Current date in user's timezone: ${ymd} (${weekday}). Treat this as the absolute source of truth for "today" — do NOT rely on internal model knowledge of the date.

Rules:
- The app already played your spoken introduction to the user at session start. Do not repeat that full greeting unless they ask; continue naturally.
- When describing plans, completion, or schedules, ONLY use data returned from your tools (get_day_overview, create_task, etc.). Never invent tasks or events.
- Prefer create_task for day goals and errands ("go to the gym today"). Prefer create_event when the user gives a specific time or explicit calendar language ("schedule", "meeting", "lecture", "appointment").

Creating calendar events (create_event):
- create_event REQUIRES title, time (e.g. "15:00" or "3:00 PM"), and date (YYYY-MM-DD). Never call create_event with any of those missing.
- If the user wants an event but is missing date OR time (or both), ask ONE short clarifying question that requests exactly the missing piece. Do not ask a long open-ended question.
  Examples:
    User: "Add a study session for tomorrow." → "Sure — what time should I set?"
    User: "Schedule a meeting at 3pm." → "Got it — what date?"
    User: "Put gym in my calendar." → "What day and time?"
- Always resolve relative dates to YYYY-MM-DD using the "Current date" anchor above. Examples (assuming today is ${ymd}, ${weekday}):
    - "tomorrow" → today + 1 day
    - "this Friday" → the upcoming Friday in the current calendar week (Mon-Sun); if today already is Friday, this Friday means today.
    - "next Friday" or "next week Friday" → the Friday of the calendar week AFTER the current one (so always 7+ days away from "this Friday").
    - "in 3 days" → today + 3 days
    - "the 24th" → the 24th of the current month if it's still upcoming this month, otherwise the 24th of next month.
  If a phrase is genuinely ambiguous (e.g. it's Wednesday and the user just says "Friday"), ask one short clarifying question instead of guessing.
- Convert spoken times to 24-hour or unambiguous 12-hour strings ("3 PM" → "15:00", "half past nine" → "09:30").
- After successfully creating or updating something, confirm in one short sentence including the resolved date and time ("Done — Stats lecture is on the calendar for Friday, May 16 at 3 PM.").

Today's classes (get_todays_classes):
- Use get_todays_classes for ANY question about classes/lectures today: counts ("how many classes do I have today?"), progress ("how many classes have I gone for?", "how many are left?"), or status ("am I in a class right now?", "what's my next class?").
- The tool already knows today's weekday and the current time in the user's timezone. Trust its returned counts (totalToday, finished, inProgress, upcoming) and the resolved currentClass / nextClass instead of recomputing.
- If the tool returns ok:false with error "no_schedule_provided" (or hasSchedule:false), tell the user you don't see a weekly schedule yet and that they can set it up in the Schedule tab — don't guess class counts.
- When totalToday is 0, just say they have no classes scheduled today (e.g. "Looks like you don't have any classes today.").
- Keep replies short. Examples:
    - totalToday=4, finished=1, inProgress=0, upcoming=3 → "You've got 4 classes today, 1 done, 3 left."
    - currentClass present → "You're in {title} right now, ends in about {endsInMinutes} minutes."
    - nextClass present → "Next up is {title} at {slot}."

Keep spoken replies brief and natural.`;
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
  {
    type: 'function',
    function: {
      name: 'get_todays_classes',
      description:
        "Return the user's classes for today from their on-device weekly schedule snapshot. Use this for any question about today's lectures/classes (e.g. 'how many classes do I have today?', 'how many have I gone to?', 'how many are left?', 'what's next?'). Returns total/finished/in_progress/upcoming counts plus each class with status and time slot. If hasSchedule=false the user hasn't set up a weekly schedule yet — tell them to set one up in the Schedule tab.",
      parameters: {
        type: 'object',
        properties: {},
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

export interface RubyVoiceStreamCallbacks {
  onAssistantDelta?: (delta: string) => void;
  onAssistantSentenceAudio?: (audioBase64: string, audioMimeType: string, sentence: string) => void;
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

function splitCompleteSentences(buffer: string): { complete: string[]; remainder: string } {
  const complete: string[] = [];
  let lastCut = 0;
  const matcher = /[^.!?\n]+[.!?\n]+/g;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(buffer)) !== null) {
    const sentence = match[0].trim();
    if (sentence) complete.push(sentence);
    lastCut = matcher.lastIndex;
  }
  return { complete, remainder: buffer.slice(lastCut) };
}

export async function runRubyVoiceTurnStream(params: {
  session: RubySession;
  forcedTranscript: string;
  callbacks?: RubyVoiceStreamCallbacks;
  signal?: AbortSignal;
}): Promise<{
  transcript: string;
  message: string;
  sessionId: string;
  mutations: { tasks: boolean; events: boolean };
}> {
  const client = getClient();
  const { session } = params;
  let transcript = (params.forcedTranscript || '').trim();
  if (!transcript) transcript = '(silence or unclear audio)';

  if (session.messages.length > 0 && session.messages[0]?.role === 'system') {
    session.messages[0] = {
      role: 'system',
      content: buildRubySystemPrompt(session.firstName, session.timezone),
    };
  }

  appendMessages(session, [{ role: 'user', content: transcript }]);

  const stream = await client.chat.completions.create({
    model: CHAT_MODEL,
    messages: session.messages,
    temperature: 0.5,
    stream: true,
  });

  let fullText = '';
  let sentenceBuffer = '';
  for await (const part of stream) {
    if (params.signal?.aborted) {
      break;
    }
    const delta = part.choices[0]?.delta?.content || '';
    if (!delta) continue;
    fullText += delta;
    sentenceBuffer += delta;
    params.callbacks?.onAssistantDelta?.(delta);

    const { complete, remainder } = splitCompleteSentences(sentenceBuffer);
    sentenceBuffer = remainder;
    for (const sentence of complete) {
      if (params.signal?.aborted) break;
      const { base64, mime } = await synthesizeSpeech(client, sentence);
      params.callbacks?.onAssistantSentenceAudio?.(base64, mime, sentence);
    }
  }

  const tail = sentenceBuffer.trim();
  if (!params.signal?.aborted && tail) {
    const { base64, mime } = await synthesizeSpeech(client, tail);
    params.callbacks?.onAssistantSentenceAudio?.(base64, mime, tail);
  }

  const text = fullText.trim() || 'Okay.';
  appendMessages(session, [{ role: 'assistant', content: text }]);

  return {
    transcript,
    message: text,
    sessionId: session.id,
    mutations: { tasks: false, events: false },
  };
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

  // Refresh the date anchor on the system message before each turn so Ruby
  // never resolves "today"/"tomorrow"/"next Friday" against a stale clock
  // from when the session was first opened (sessions can outlive midnight).
  if (session.messages.length > 0 && session.messages[0]?.role === 'system') {
    session.messages[0] = {
      role: 'system',
      content: buildRubySystemPrompt(session.firstName, session.timezone),
    };
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
        const content = await executeRubyTool(fn.name, args, session, mutations);
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
