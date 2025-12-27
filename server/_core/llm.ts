import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

// 獲取 API 配置
const getApiConfig = () => {
  // 優先使用 Forge API（Manus 平台內部）
  if (ENV.forgeApiKey && ENV.forgeApiKey.trim().length > 0) {
    return {
      provider: "forge",
      apiUrl: ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
        ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`
        : "https://forge.manus.im/v1/chat/completions",
      apiKey: ENV.forgeApiKey,
      model: "gemini-2.5-flash",
    };
  }
  
  // 使用 Anthropic Claude API
  if (ENV.anthropicApiKey && ENV.anthropicApiKey.trim().length > 0) {
    return {
      provider: "anthropic",
      apiUrl: "https://api.anthropic.com/v1/messages",
      apiKey: ENV.anthropicApiKey,
      model: "claude-sonnet-4-20250514", // Claude 4.5
    };
  }
  
  // 使用 OpenAI API
  if (ENV.openaiApiKey && ENV.openaiApiKey.trim().length > 0) {
    return {
      provider: "openai",
      apiUrl: "https://api.openai.com/v1/chat/completions",
      apiKey: ENV.openaiApiKey,
      model: "gpt-4o-mini", // 或 gpt-4o
    };
  }
  
  return null;
};

const assertApiKey = () => {
  const config = getApiConfig();
  if (!config) {
    throw new Error("No LLM API key configured. Please set OPENAI_API_KEY, ANTHROPIC_API_KEY, or BUILT_IN_FORGE_API_KEY environment variable.");
  }
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

// Anthropic Claude API 調用
async function invokeAnthropicLLM(params: InvokeParams, config: { apiUrl: string; apiKey: string; model: string }): Promise<InvokeResult> {
  const { messages } = params;
  
  // 將 OpenAI 格式轉換為 Anthropic 格式
  let systemPrompt = "";
  const anthropicMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
  
  for (const msg of messages) {
    const normalizedMsg = normalizeMessage(msg);
    const content = typeof normalizedMsg.content === "string" 
      ? normalizedMsg.content 
      : JSON.stringify(normalizedMsg.content);
    
    if (normalizedMsg.role === "system") {
      systemPrompt = content;
    } else if (normalizedMsg.role === "user" || normalizedMsg.role === "assistant") {
      anthropicMessages.push({
        role: normalizedMsg.role,
        content,
      });
    }
  }

  const payload: Record<string, unknown> = {
    model: config.model,
    max_tokens: 4096,
    messages: anthropicMessages,
  };

  if (systemPrompt) {
    payload.system = systemPrompt;
  }

  console.log(`[LLM] Calling Anthropic API with model ${config.model}`);

  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[LLM] Anthropic Error: ${response.status} ${response.statusText} – ${errorText}`);
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  const result = await response.json();
  console.log(`[LLM] Anthropic Success`);

  // 將 Anthropic 響應轉換為 OpenAI 格式
  return {
    id: result.id || "anthropic-response",
    created: Date.now(),
    model: result.model || config.model,
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: result.content?.[0]?.text || "",
      },
      finish_reason: result.stop_reason || "stop",
    }],
    usage: {
      prompt_tokens: result.usage?.input_tokens || 0,
      completion_tokens: result.usage?.output_tokens || 0,
      total_tokens: (result.usage?.input_tokens || 0) + (result.usage?.output_tokens || 0),
    },
  };
}

// OpenAI 兼容 API 調用
async function invokeOpenAILLM(params: InvokeParams, config: { apiUrl: string; apiKey: string; model: string; provider: string }): Promise<InvokeResult> {
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;

  const payload: Record<string, unknown> = {
    model: config.model,
    messages: messages.map(normalizeMessage),
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  payload.max_tokens = 4096;
  
  // 只有 Forge API 支持 thinking 參數
  if (config.provider === "forge") {
    payload.thinking = {
      "budget_tokens": 128
    };
  }

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  console.log(`[LLM] Calling ${config.provider} API (${config.apiUrl}) with model ${config.model}`);

  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[LLM] ${config.provider} Error: ${response.status} ${response.statusText} – ${errorText}`);
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  const result = await response.json() as InvokeResult;
  console.log(`[LLM] ${config.provider} Success: received ${result.choices?.length || 0} choices`);
  
  return result;
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  const config = getApiConfig()!;

  if (config.provider === "anthropic") {
    return invokeAnthropicLLM(params, config);
  }

  return invokeOpenAILLM(params, { ...config, provider: config.provider });
}
