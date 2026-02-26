import type { LlmSettings } from "./storage";

type Provider = LlmSettings["provider"];

/** Shared shape for Anthropic/OpenAI list-models responses. */
interface ModelListResponse {
  data?: { id: string }[];
}

/** Google's list-models response shape. */
interface GoogleModelListResponse {
  models?: { name: string }[];
}

export interface FetchModelsResult {
  models: string[];
  valid: boolean;
}

export async function fetchModels(
  provider: Provider,
  apiKey: string,
): Promise<FetchModelsResult> {
  if (!apiKey) return { models: [], valid: false };

  try {
    const models = await fetchProviderModels(provider, apiKey);
    if (models.length === 0) return { models: [], valid: false };

    return { models, valid: true };
  } catch {
    return { models: [], valid: false };
  }
}

async function fetchProviderModels(
  provider: Provider,
  apiKey: string,
): Promise<string[]> {
  switch (provider) {
    case "anthropic":
      return fetchAnthropicModels(apiKey);
    case "openai":
      return fetchOpenAIModels(apiKey);
    case "google":
      return fetchGoogleModels(apiKey);
  }
}

async function fetchAnthropicModels(apiKey: string): Promise<string[]> {
  const resp = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
  });
  if (!resp.ok) throw new Error(resp.statusText);
  const data: ModelListResponse = await resp.json();
  return (data.data ?? []).map((m) => m.id).sort();
}

async function fetchOpenAIModels(apiKey: string): Promise<string[]> {
  const resp = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!resp.ok) throw new Error(resp.statusText);
  const data: ModelListResponse = await resp.json();
  return (data.data ?? [])
    .map((m) => m.id)
    .filter((id) => id.startsWith("gpt-") || id.startsWith("o"))
    .sort();
}

async function fetchGoogleModels(apiKey: string): Promise<string[]> {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
  );
  if (!resp.ok) throw new Error(resp.statusText);
  const data: GoogleModelListResponse = await resp.json();
  return (data.models ?? [])
    .map((m) => m.name.replace("models/", ""))
    .filter((id) => id.startsWith("gemini"))
    .sort();
}
