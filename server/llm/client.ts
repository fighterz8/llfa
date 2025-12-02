import OpenAI from "openai";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

export interface LLMMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface LLMResponse {
  content: string | null;
  toolCalls: LLMToolCall[];
  finishReason: string;
}

export interface LLMTool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface LLMConfig {
  provider: "openai" | "gemini";
  apiKey: string;
  model?: string;
}

export class LLMClient {
  private provider: "openai" | "gemini";
  private openaiClient?: OpenAI;
  private geminiClient?: GoogleGenerativeAI;
  private model: string;

  constructor(config: LLMConfig) {
    this.provider = config.provider;
    
    if (config.provider === "openai") {
      this.openaiClient = new OpenAI({ apiKey: config.apiKey });
      this.model = config.model || "gpt-5-nano";
    } else {
      this.geminiClient = new GoogleGenerativeAI(config.apiKey);
      this.model = config.model || "gemini-2.5-pro-flash";
    }
  }

  async chat(
    messages: LLMMessage[],
    tools?: LLMTool[],
    toolChoice: "auto" | "required" | "none" = "auto"
  ): Promise<LLMResponse> {
    if (this.provider === "openai") {
      return this.chatOpenAI(messages, tools, toolChoice);
    } else {
      return this.chatGemini(messages, tools, toolChoice);
    }
  }

  private async chatOpenAI(
    messages: LLMMessage[],
    tools?: LLMTool[],
    toolChoice: "auto" | "required" | "none" = "auto"
  ): Promise<LLMResponse> {
    if (!this.openaiClient) {
      throw new Error("OpenAI client not initialized");
    }

    const openaiMessages = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const openaiTools = tools?.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));

    const response = await this.openaiClient.chat.completions.create({
      model: this.model,
      messages: openaiMessages,
      tools: openaiTools,
      tool_choice: toolChoice === "none" ? undefined : toolChoice,
    });

    const choice = response.choices[0];
    const toolCalls =
      choice.message.tool_calls?.map((tc) => {
        if (tc.type === "function") {
          return {
            id: tc.id,
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments),
          };
        }
        return null;
      }).filter((tc): tc is LLMToolCall => tc !== null) || [];

    return {
      content: choice.message.content,
      toolCalls,
      finishReason: choice.finish_reason,
    };
  }

  private async chatGemini(
    messages: LLMMessage[],
    tools?: LLMTool[],
    toolChoice: "auto" | "required" | "none" = "auto"
  ): Promise<LLMResponse> {
    if (!this.geminiClient) {
      throw new Error("Gemini client not initialized");
    }

    const model = this.geminiClient.getGenerativeModel({
      model: this.model,
      tools: tools
        ? [
            {
              functionDeclarations: tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                parameters: {
                  type: SchemaType.OBJECT,
                  properties: tool.parameters.properties,
                  required: tool.parameters.required || [],
                },
              })),
            },
          ]
        : undefined,
    });

    const systemPrompt = messages.find((m) => m.role === "system")?.content || "";
    const chatMessages = messages
      .filter((m) => m.role !== "system")
      .map((msg) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      }));

    const history = chatMessages.slice(0, -1);
    const lastMessage = chatMessages[chatMessages.length - 1];

    const chat = model.startChat({
      history,
      systemInstruction: systemPrompt || undefined,
    });

    const result = await chat.sendMessage(lastMessage.parts[0].text);
    const response = result.response;
    const toolCalls: LLMToolCall[] = [];

    if (response.functionCalls()) {
      const calls = response.functionCalls();
      calls?.forEach((call, index) => {
        toolCalls.push({
          id: `call_${index}`,
          name: call.name,
          arguments: call.args as Record<string, any>,
        });
      });
    }

    return {
      content: response.text() || null,
      toolCalls,
      finishReason: "stop",
    };
  }
}
