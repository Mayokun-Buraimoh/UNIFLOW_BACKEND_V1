import OpenAI from 'openai';
import { toFile } from 'openai/uploads';
import type { ChatCompletionTool, ChatCompletionToolMessageParam } from 'openai/resources/chat/completions';
import { appendMessages, type RubySession } from './rubySessionStore';
import {
  emptyMutationFlags,
  executeRubyTool,
  type ToolMutationFlags,
} from './rubyTaskEventTools';
import {
  hasAnyMutation,
  isNavigateTool,
  parseNavigateResult,
  type RubyNavigateIntent,
} from './rubyAppTools';

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

App navigation (navigate_to):
- You CAN navigate the UniFlow app using navigate_to. NEVER say you cannot access settings, plans, courses, or other screens.
- Use navigate_to for tabs: home, plans, courses, settings, chatbot, weekly_schedule, analytics, profile.
- To open a specific plan or course: call list_plans or list_courses first to resolve the id, then navigate_to with screen=plan or screen=course.
- Do not use navigate_to for content questions — use get_day_overview, list_plans, get_weekly_schedule, etc.

Plans, courses, and schedule:
- Use list_plans / get_plan / create_plan / update_plan for plans. Use list_courses / get_course / create_course for courses.
- Use get_weekly_schedule and update_weekly_schedule for the weekly class grid (server is source of truth).
- Always call tools before claiming an action succeeded. Never invent ids — list first, then act.
- For destructive actions (delete_plan, delete_task, delete_event), confirm once if the user was not explicit.

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
        "Return the user's classes for today from their weekly schedule in the database. Use for questions about today's lectures/classes.",
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate_to',
      description:
        'Navigate the UniFlow app. Use for tabs or deep links to a plan or course. Call list_plans/list_courses first to resolve ids by name.',
      parameters: {
        type: 'object',
        properties: {
          screen: {
            type: 'string',
            enum: ['home', 'plans', 'courses', 'settings', 'chatbot', 'weekly_schedule', 'analytics', 'profile', 'plan', 'course'],
          },
          planId: { type: 'string', description: 'Required when screen is plan' },
          courseId: { type: 'string', description: 'Required when screen is course' },
        },
        required: ['screen'],
      },
    },
  },
  {
    type: 'function',
    function: { name: 'list_plans', description: 'List the user plans (id, title, progress).', parameters: { type: 'object', properties: {} } },
  },
  {
    type: 'function',
    function: {
      name: 'get_plan',
      description: 'Get full plan details by id.',
      parameters: { type: 'object', properties: { planId: { type: 'string' } }, required: ['planId'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_plan',
      description: 'Create a new plan.',
      parameters: {
        type: 'object',
        properties: { title: { type: 'string' }, isCustom: { type: 'boolean' } },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_plan',
      description: 'Update plan title, targets, or tasks.',
      parameters: {
        type: 'object',
        properties: {
          planId: { type: 'string' },
          title: { type: 'string' },
          targets: { type: 'array', items: { type: 'object' } },
          tasks: { type: 'array', items: { type: 'object' } },
        },
        required: ['planId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_plan',
      description: 'Delete a plan by id. Confirm with user if not explicit.',
      parameters: { type: 'object', properties: { planId: { type: 'string' } }, required: ['planId'] },
    },
  },
  {
    type: 'function',
    function: { name: 'list_courses', description: 'List user courses.', parameters: { type: 'object', properties: {} } },
  },
  {
    type: 'function',
    function: {
      name: 'get_course',
      description: 'Get course summary by id.',
      parameters: { type: 'object', properties: { courseId: { type: 'string' } }, required: ['courseId'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_course',
      description: 'Create a course folder.',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string' }, code: { type: 'string' }, color: { type: 'string' } },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: { name: 'get_weekly_schedule', description: 'Get weekly class schedule grid from server.', parameters: { type: 'object', properties: {} } },
  },
  {
    type: 'function',
    function: {
      name: 'update_weekly_schedule',
      description: 'Replace weekly schedule grid. Keys: Mon, Tue, Wed, Thur, Fri, etc. Values: string arrays.',
      parameters: {
        type: 'object',
        properties: { data: { type: 'object', description: 'Day -> class name arrays' } },
        required: ['data'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'toggle_task',
      description: 'Toggle task completed/pending by id.',
      parameters: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_task',
      description: 'Delete a task by id.',
      parameters: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_event',
      description: 'Update calendar event fields.',
      parameters: {
        type: 'object',
        properties: {
          eventId: { type: 'string' },
          title: { type: 'string' },
          time: { type: 'string' },
          date: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'critical'] },
        },
        required: ['eventId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_event',
      description: 'Delete calendar event by id.',
      parameters: { type: 'object', properties: { eventId: { type: 'string' } }, required: ['eventId'] },
    },
  },
];

export interface RubyVoiceTurnResult {
  transcript: string;
  message: string;
  audioBase64: string;
  audioMimeType: string;
  sessionId: string;
  mutations: ToolMutationFlags;
  debug?: { toolRounds: number };
}

export interface RubyVoiceStreamCallbacks {
  onAssistantDelta?: (delta: string) => void;
  onAssistantSentenceAudio?: (audioBase64: string, audioMimeType: string, sentence: string) => void;
  onMutations?: (mutations: ToolMutationFlags) => void;
  onNavigate?: (intent: RubyNavigateIntent) => void;
  onToolStarted?: (name: string) => void;
  onToolCompleted?: (name: string) => void;
}

export interface RubyToolPhaseResult {
  replyText: string;
  mutations: ToolMutationFlags;
  toolRounds: number;
}

const MAX_TOOL_ITERATIONS = 8;

function refreshRubySystemMessage(session: RubySession): void {
  if (session.messages.length > 0 && session.messages[0]?.role === 'system') {
    session.messages[0] = {
      role: 'system',
      content: buildRubySystemPrompt(session.firstName, session.timezone),
    };
  }
}

/** Non-streaming tool loop; returns final assistant text (not yet appended to session). */
export async function runRubyToolPhase(params: {
  session: RubySession;
  signal?: AbortSignal;
  onToolStarted?: (name: string) => void;
  onToolCompleted?: (name: string) => void;
  onMutations?: (mutations: ToolMutationFlags) => void;
  onNavigate?: (intent: RubyNavigateIntent) => void;
}): Promise<RubyToolPhaseResult> {
  const client = getClient();
  const { session } = params;
  const mutations: ToolMutationFlags = emptyMutationFlags();
  let toolRounds = 0;

  const emitMutationsIfNeeded = () => {
    if (hasAnyMutation(mutations)) {
      params.onMutations?.({ ...mutations });
    }
  };

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    if (params.signal?.aborted) {
      throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
    }

    const completion = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: session.messages,
      tools: RUBY_TOOLS,
      tool_choice: 'auto',
      temperature: 0.5,
    });

    const msg = completion.choices[0]?.message;
    if (!msg) break;

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      toolRounds += 1;
      appendMessages(session, [
        {
          role: 'assistant',
          content: msg.content,
          tool_calls: msg.tool_calls,
        },
      ]);

      const toolMsgs: ChatCompletionToolMessageParam[] = [];
      for (const tc of msg.tool_calls) {
        if (params.signal?.aborted) {
          throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
        }
        const fn = tc.function;
        params.onToolStarted?.(fn.name);
        let args: Record<string, unknown> = {};
        try {
          args = fn.arguments ? (JSON.parse(fn.arguments) as Record<string, unknown>) : {};
        } catch {
          args = {};
        }
        const content = await executeRubyTool(fn.name, args, session, mutations);
        params.onToolCompleted?.(fn.name);
        if (isNavigateTool(fn.name)) {
          const intent = parseNavigateResult(content);
          if (intent) params.onNavigate?.(intent);
        }
        emitMutationsIfNeeded();
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
    return { replyText: text, mutations, toolRounds };
  }

  return {
    replyText: 'I ran into a loop processing that. Please try again.',
    mutations,
    toolRounds,
  };
}

async function streamAssistantReplyTts(
  client: OpenAI,
  replyText: string,
  callbacks: RubyVoiceStreamCallbacks | undefined,
  signal?: AbortSignal
): Promise<string> {
  const text = replyText.trim() || 'Okay.';
  let sentenceBuffer = text;
  let emittedChars = 0;

  const emitPartial = (nextEmitted: number) => {
    if (nextEmitted <= emittedChars) return;
    const slice = text.slice(emittedChars, nextEmitted);
    emittedChars = nextEmitted;
    callbacks?.onAssistantDelta?.(slice);
  };

  emitPartial(text.length);

  const { complete, remainder } = splitCompleteSentences(sentenceBuffer);
  sentenceBuffer = remainder;
  for (const sentence of complete) {
    if (signal?.aborted) break;
    const { base64, mime } = await synthesizeSpeech(client, sentence);
    callbacks?.onAssistantSentenceAudio?.(base64, mime, sentence);
  }

  const tail = sentenceBuffer.trim();
  if (!signal?.aborted && tail) {
    const { base64, mime } = await synthesizeSpeech(client, tail);
    callbacks?.onAssistantSentenceAudio?.(base64, mime, tail);
  }

  return text;
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
  mutations: ToolMutationFlags;
}> {
  const client = getClient();
  const { session } = params;
  let transcript = (params.forcedTranscript || '').trim();
  if (!transcript) transcript = '(silence or unclear audio)';

  refreshRubySystemMessage(session);
  appendMessages(session, [{ role: 'user', content: transcript }]);

  const toolPhase = await runRubyToolPhase({
    session,
    signal: params.signal,
    onToolStarted: params.callbacks?.onToolStarted,
    onToolCompleted: params.callbacks?.onToolCompleted,
    onMutations: params.callbacks?.onMutations,
    onNavigate: params.callbacks?.onNavigate,
  });

  if (params.signal?.aborted) {
    throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
  }

  const message = await streamAssistantReplyTts(
    client,
    toolPhase.replyText,
    params.callbacks,
    params.signal
  );

  appendMessages(session, [{ role: 'assistant', content: message }]);

  return {
    transcript,
    message,
    sessionId: session.id,
    mutations: {
      tasks: toolPhase.mutations.tasks,
      events: toolPhase.mutations.events,
      plans: toolPhase.mutations.plans,
      courses: toolPhase.mutations.courses,
      schedule: toolPhase.mutations.schedule,
    },
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

  refreshRubySystemMessage(session);
  appendMessages(session, [{ role: 'user', content: transcript }]);

  const toolPhase = await runRubyToolPhase({ session });
  const text = toolPhase.replyText;
  appendMessages(session, [{ role: 'assistant', content: text }]);
  const { base64, mime } = await synthesizeSpeech(client, text);

  return {
    transcript,
    message: text,
    audioBase64: base64,
    audioMimeType: mime,
    sessionId: session.id,
    mutations: {
      tasks: toolPhase.mutations.tasks,
      events: toolPhase.mutations.events,
      plans: toolPhase.mutations.plans,
      courses: toolPhase.mutations.courses,
      schedule: toolPhase.mutations.schedule,
    },
    ...(params.includeDebug ? { debug: { toolRounds: toolPhase.toolRounds } } : {}),
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
