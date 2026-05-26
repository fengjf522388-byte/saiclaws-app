import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
const DEEPSEEK_BASE = "https://api.deepseek.com/v1/chat/completions";

const SYSTEM_PROMPT = `你是"悟空"，一位注册会计师（CPA）学习助手。你的特点：

1. **用简单易懂的语言解释CPA概念**，把复杂的会计、税法、经济法知识讲得通俗易懂，像在跟完全零基础的朋友聊天一样。
2. **帮助解答会计、税法、经济法相关的问题**，包括知识点讲解、题目分析、记忆技巧等。
3. **分析学习进度并给出建议**，如果用户分享了学习情况，帮他们梳理薄弱环节，制定复习策略。
4. **语气温暖、鼓励、有耐心**，像一个热心的学长/学姐在辅导学弟学妹。适当使用猴子表情 🐵。
5. **用中文回复**，保持亲切自然的风格。

记住：你是一只智慧的猴子悟空，你的使命是帮助CPA考生轻松过关！`;

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface RequestBody {
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

interface DeepSeekResponse {
  id: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

Deno.serve(async (req: Request) => {
  // CORS headers
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  // Handle OPTIONS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  // Only accept POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use POST." }),
      { status: 405, headers },
    );
  }

  try {
    // Validate API key
    if (!DEEPSEEK_API_KEY) {
      console.error("DEEPSEEK_API_KEY is not set");
      return new Response(
        JSON.stringify({ error: "Server configuration error: API key not set" }),
        { status: 500, headers },
      );
    }

    // Parse request body
    const body: RequestBody = await req.json();

    if (!body.message || typeof body.message !== "string" || body.message.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing 'message' field in request body" }),
        { status: 400, headers },
      );
    }

    // Build messages array
    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    // Add conversation history if provided
    if (body.history && Array.isArray(body.history)) {
      for (const msg of body.history) {
        if (
          msg.role &&
          (msg.role === "user" || msg.role === "assistant") &&
          typeof msg.content === "string"
        ) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    // Add the current user message
    messages.push({ role: "user", content: body.message });

    console.log(`Sending ${messages.length} messages to DeepSeek API`);

    // Call DeepSeek API
    const response = await fetch(DEEPSEEK_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages,
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`DeepSeek API error (${response.status}):`, errorText);
      return new Response(
        JSON.stringify({
          error: "AI service temporarily unavailable, please try again later 🐵",
        }),
        { status: 502, headers },
      );
    }

    const data: DeepSeekResponse = await response.json();

    if (!data.choices || data.choices.length === 0) {
      console.error("DeepSeek returned no choices:", JSON.stringify(data));
      return new Response(
        JSON.stringify({
          error: "AI returned an empty response, please try again 🐵",
        }),
        { status: 502, headers },
      );
    }

    const reply = data.choices[0].message.content;

    console.log(`Response: ${data.usage?.total_tokens ?? "?"} tokens used`);

    return new Response(
      JSON.stringify({ reply }),
      { status: 200, headers },
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({
        error: "An unexpected error occurred, please try again later 🐵",
      }),
      { status: 500, headers },
    );
  }
});
