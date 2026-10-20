import { requestUrl } from "obsidian";
import type { ChatMessage } from "./prompts.ts";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export class AiError extends Error {}

export async function chat(
	apiKey: string,
	model: string,
	messages: ChatMessage[],
	maxTokens: number,
): Promise<string> {
	if (!apiKey) throw new AiError("Add your OpenRouter API key in the Notes System settings.");

	const response = await requestUrl({
		url: ENDPOINT,
		method: "POST",
		throw: false,
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			"X-Title": "Notes System for Obsidian",
		},
		body: JSON.stringify({
			model,
			messages,
			temperature: 0.2,
			max_tokens: maxTokens,
			response_format: { type: "json_object" },
			// Only route to providers that neither train on nor retain prompts.
			provider: { data_collection: "deny", zdr: true },
		}),
	});

	let data: any;
	try {
		data = response.json;
	} catch {
		throw new AiError(`OpenRouter returned HTTP ${response.status}.`);
	}
	if (response.status >= 400 || data?.error) {
		const message = data?.error?.message ?? `HTTP ${response.status}`;
		throw new AiError(`OpenRouter: ${message}`);
	}
	const content = data?.choices?.[0]?.message?.content;
	if (typeof content !== "string" || !content.trim()) {
		throw new AiError("OpenRouter returned an empty reply.");
	}
	return content;
}
