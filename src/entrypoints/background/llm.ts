import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV1 } from "ai";
import { streamText } from "ai";
import type { Settings } from "@/utils/storage";

function getModel(settings: Settings["llm"], apiKey: string): LanguageModelV1 {
  switch (settings.provider) {
    case "openai":
      return createOpenAI({ apiKey })(settings.model);
    case "anthropic":
      return createAnthropic({
        apiKey,
        headers: { "anthropic-dangerous-direct-browser-access": "true" },
      })(settings.model);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(settings.model);
    default: {
      const _exhaustive: never = settings.provider;
      throw new Error(`Unknown provider: ${_exhaustive}`);
    }
  }
}

export async function generateExplanation(
  prompt: string,
  llmSettings: Settings["llm"],
  apiKey: string,
  onChunk: (text: string) => void,
): Promise<string> {
  const model = getModel(llmSettings, apiKey);
  const { textStream } = streamText({
    model,
    prompt,
  });

  let fullText = "";
  for await (const chunk of textStream) {
    fullText += chunk;
    onChunk(fullText);
  }
  return fullText;
}
