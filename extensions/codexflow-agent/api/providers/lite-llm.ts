import OpenAI from "openai"
import { Anthropic } from "@anthropic-ai/sdk" // Keep for type usage only

import { litellmDefaultModelId, litellmDefaultModelInfo, TOOL_PROTOCOL } from "@roo-code/types"

import { calculateApiCostOpenAI } from "../../shared/cost"

import { ApiHandlerOptions } from "../../shared/api"

import { ApiStream, ApiStreamUsageChunk } from "../transform/stream"
import { convertToOpenAiMessages } from "../transform/openai-format"

import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata } from "../index"
import { RouterProvider } from "./router-provider"
import { handleOpenAIError } from "./utils/openai-error-handler"

/**
 * LiteLLM provider handler
 *
 * This handler uses the LiteLLM API to proxy requests to various LLM providers.
 * It follows the OpenAI API format for compatibility.
 */
export class LiteLLMHandler extends RouterProvider implements SingleCompletionHandler {
	constructor(options: ApiHandlerOptions) {
		// Normalize base URL - remove trailing slashes and /v1 suffix if present
		// OpenAI SDK automatically adds /v1/chat/completions, so base URL should not include /v1
		let baseURL = options.litellmBaseUrl || "http://localhost:4000"
		baseURL = baseURL.trim().replace(/\/+$/, "") // Remove trailing slashes
		baseURL = baseURL.replace(/\/v1\/?$/, "") // Remove /v1 suffix if present
		
		super({
			options,
			name: "litellm",
			baseURL,
			apiKey: options.litellmApiKey || "dummy-key",
			modelId: options.litellmModelId,
			defaultModelId: litellmDefaultModelId,
			defaultModelInfo: litellmDefaultModelInfo,
		})
	}

	private isGpt5(modelId: string): boolean {
		// Match gpt-5, gpt5, and variants like gpt-5o, gpt-5-turbo, gpt5-preview, gpt-5.1
		// Avoid matching gpt-50, gpt-500, etc.
		return /\bgpt-?5(?!\d)/i.test(modelId)
	}

	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		const { id: modelId, info } = await this.fetchModel()

		// CF-X Model: 3-layer workflow via orchestrator HTTP API
		if (modelId === "cf-x" || modelId === "cf-x-3-layer") {
			yield* this.handleCFXWorkflow(systemPrompt, messages)
			return
		}

		const openAiMessages = convertToOpenAiMessages(messages, { mergeToolResultText: true })

		// Prepare messages with cache control if enabled and supported
		let systemMessage: OpenAI.Chat.ChatCompletionMessageParam
		let enhancedMessages: OpenAI.Chat.ChatCompletionMessageParam[]

		if (this.options.litellmUsePromptCache && info.supportsPromptCache) {
			// Create system message with cache control in the proper format
			systemMessage = {
				role: "system",
				content: [
					{
						type: "text",
						text: systemPrompt,
						cache_control: { type: "ephemeral" },
					} as any,
				],
			}

			// Find the last two user messages to apply caching
			const userMsgIndices = openAiMessages.reduce(
				(acc, msg, index) => (msg.role === "user" ? [...acc, index] : acc),
				[] as number[],
			)
			const lastUserMsgIndex = userMsgIndices[userMsgIndices.length - 1] ?? -1
			const secondLastUserMsgIndex = userMsgIndices[userMsgIndices.length - 2] ?? -1

			// Apply cache_control to the last two user messages
			enhancedMessages = openAiMessages.map((message, index) => {
				if ((index === lastUserMsgIndex || index === secondLastUserMsgIndex) && message.role === "user") {
					// Handle both string and array content types
					if (typeof message.content === "string") {
						return {
							...message,
							content: [
								{
									type: "text",
									text: message.content,
									cache_control: { type: "ephemeral" },
								} as any,
							],
						}
					} else if (Array.isArray(message.content)) {
						// Apply cache control to the last content item in the array
						return {
							...message,
							content: message.content.map((content, contentIndex) =>
								contentIndex === message.content.length - 1
									? ({
											...content,
											cache_control: { type: "ephemeral" },
										} as any)
									: content,
							),
						}
					}
				}
				return message
			})
		} else {
			// No cache control - use simple format
			systemMessage = { role: "system", content: systemPrompt }
			enhancedMessages = openAiMessages
		}

		// Required by some providers; others default to max tokens allowed
		let maxTokens: number | undefined = info.maxTokens ?? undefined

		// For DeepSeek V3.2 and similar models with 163840 context limit,
		// limit max_tokens to prevent context length errors
		// Rule: max_tokens should not exceed context window - estimated input tokens
		const isDeepSeekV32 = modelId.includes("deepseek/deepseek-v3.2")
		if (isDeepSeekV32 && maxTokens) {
			// DeepSeek V3.2 has 163840 context limit (not 200000 as configured)
			// Limit max_tokens to safe value: 20% of actual context limit (32768)
			// This leaves 80% (131072) for input tokens
			const actualContextLimit = 163840
			const safeMaxTokens = Math.min(maxTokens, Math.floor(actualContextLimit * 0.2))
			if (safeMaxTokens < maxTokens) {
				maxTokens = safeMaxTokens
			}
		}

		// For Claude Sonnet 4.5 and similar models with 1000000 context limit,
		// limit max_tokens to prevent context length errors
		const isClaudeSonnet45 = modelId.includes("claude-sonnet-4.5")
		if (isClaudeSonnet45 && maxTokens) {
			// Claude Sonnet 4.5 has 1000000 context limit
			// Limit max_tokens to safe value: 20% of actual context limit (200000)
			// This leaves 80% (800000) for input tokens
			const actualContextLimit = 1000000
			const safeMaxTokens = Math.min(maxTokens, Math.floor(actualContextLimit * 0.2))
			if (safeMaxTokens < maxTokens) {
				maxTokens = safeMaxTokens
			}
		}

		// Check if this is a GPT-5 model that requires max_completion_tokens instead of max_tokens
		const isGPT5Model = this.isGpt5(modelId)

		// Check if model supports native tools and tools are provided with native protocol
		const supportsNativeTools = info.supportsNativeTools ?? false
		const useNativeTools =
			supportsNativeTools &&
			metadata?.tools &&
			metadata.tools.length > 0 &&
			metadata?.toolProtocol === TOOL_PROTOCOL.NATIVE

		// For DeepSeek and similar models, default to tool_choice: 'none' if not explicitly set
		// This prevents models from making tool calls when content is expected
		// DeepSeek models tend to prefer tool calling even when not explicitly requested
		const isDeepSeekModel = modelId.includes("deepseek") || modelId.includes("deep-seek")
		// More aggressive: disable tool calls unless explicitly requested via tool_choice
		const shouldDisableToolCalls = isDeepSeekModel && (!metadata?.tool_choice || metadata.tool_choice === "none")

		const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
			model: modelId,
			messages: [systemMessage, ...enhancedMessages],
			stream: true,
			stream_options: {
				include_usage: true,
			},
			...(useNativeTools && { tools: this.convertToolsForOpenAI(metadata.tools) }),
			...(useNativeTools && metadata.tool_choice && { tool_choice: metadata.tool_choice }),
			// Disable tool calls for DeepSeek models when tools are not explicitly requested
			...(shouldDisableToolCalls && { tool_choice: "none" }),
		}

		// GPT-5 models require max_completion_tokens instead of the deprecated max_tokens parameter
		if (isGPT5Model && maxTokens) {
			requestOptions.max_completion_tokens = maxTokens
		} else if (maxTokens) {
			requestOptions.max_tokens = maxTokens
		}

		if (this.supportsTemperature(modelId)) {
			requestOptions.temperature = this.options.modelTemperature ?? 0
		}

		try {
			// Support abort signal from metadata if provided (for request cancellation)
			const requestConfig: OpenAI.RequestOptions = {}
			if (metadata?.abortSignal) {
				requestConfig.signal = metadata.abortSignal
			}

			const { data: completion } = await this.client.chat.completions
				.create(requestOptions, requestConfig)
				.withResponse()

			let lastUsage
			let hasContent = false
			let hasToolCalls = false
			let lastChunk: any = null

			for await (const chunk of completion) {
				// Check if request was aborted during streaming
				if (metadata?.abortSignal?.aborted) {
					throw new Error("Request was terminated or cancelled")
				}
				const delta = chunk.choices[0]?.delta
				const usage = chunk.usage as LiteLLMUsage
				lastChunk = chunk

				if (delta?.content) {
					hasContent = true
					yield { type: "text", text: delta.content }
				}

				// Handle tool calls in stream - emit partial chunks for NativeToolCallParser
				if (delta?.tool_calls) {
					hasToolCalls = true
					// If we haven't yielded any content yet and we're getting tool calls,
					// yield a placeholder text immediately to prevent "no assistant messages" error
					if (!hasContent) {
						yield { type: "text", text: "" }
						hasContent = true // Mark as having content to prevent duplicate placeholder
					}
					for (const toolCall of delta.tool_calls) {
						yield {
							type: "tool_call_partial",
							index: toolCall.index,
							id: toolCall.id,
							name: toolCall.function?.name,
							arguments: toolCall.function?.arguments,
						}
					}
				}

				if (usage) {
					lastUsage = usage
				}
			}

			// Handle case where model returned tool_calls but no content
			// This can happen with models like DeepSeek V3.2 that prefer tool calling
			if (!hasContent && hasToolCalls && lastChunk) {
				const finalMessage = lastChunk.choices?.[0]?.message
				if (finalMessage?.tool_calls && finalMessage.tool_calls.length > 0) {
					// Yield a helpful message explaining that tool calls were made
					const toolNames = finalMessage.tool_calls
						.map((tc: any) => tc.function?.name)
						.filter(Boolean)
						.join(", ")
					yield {
						type: "text",
						text: `\n\n[Model made tool calls: ${toolNames}. Tool calling is not fully supported in this context. Please try with tool_choice: 'none' or use a different model.]\n`,
					}
				}
			}

			if (lastUsage) {
				// Extract cache-related information if available
				// LiteLLM may use different field names for cache tokens
				const cacheWriteTokens =
					lastUsage.cache_creation_input_tokens || (lastUsage as any).prompt_cache_miss_tokens || 0
				const cacheReadTokens =
					lastUsage.prompt_tokens_details?.cached_tokens ||
					(lastUsage as any).cache_read_input_tokens ||
					(lastUsage as any).prompt_cache_hit_tokens ||
					0

				const { totalCost } = calculateApiCostOpenAI(
					info,
					lastUsage.prompt_tokens || 0,
					lastUsage.completion_tokens || 0,
					cacheWriteTokens,
					cacheReadTokens,
				)

				const usageData: ApiStreamUsageChunk = {
					type: "usage",
					inputTokens: lastUsage.prompt_tokens || 0,
					outputTokens: lastUsage.completion_tokens || 0,
					cacheWriteTokens: cacheWriteTokens > 0 ? cacheWriteTokens : undefined,
					cacheReadTokens: cacheReadTokens > 0 ? cacheReadTokens : undefined,
					totalCost,
				}

				yield usageData
			}
		} catch (error) {
			throw handleOpenAIError(error, this.providerName)
		}
	}

	async completePrompt(prompt: string): Promise<string> {
		const { id: modelId, info } = await this.fetchModel()

		// CF-X Model: 3-layer workflow via orchestrator HTTP API
		if (modelId === "cf-x" || modelId === "cf-x-3-layer") {
			const result = await this.callCFXWorkflow(prompt)
			return result
		}

		// Check if this is a GPT-5 model that requires max_completion_tokens instead of max_tokens
		const isGPT5Model = this.isGpt5(modelId)

		// For DeepSeek and similar models, default to tool_choice: 'none' if not explicitly set
		// DeepSeek models tend to prefer tool calling even when not explicitly requested
		const isDeepSeekModel = modelId.includes("deepseek") || modelId.includes("deep-seek")
		// More aggressive: always disable tool calls for DeepSeek unless explicitly requested
		// Note: completePrompt doesn't have metadata parameter, so we always disable
		const shouldDisableToolCalls = isDeepSeekModel

		// For DeepSeek V3.2, limit max_tokens to prevent context length errors
		let maxTokens: number | undefined = info.maxTokens ?? undefined
		const isDeepSeekV32 = modelId.includes("deepseek/deepseek-v3.2")
		if (isDeepSeekV32 && maxTokens) {
			// DeepSeek V3.2 has 163840 context limit (not 200000 as configured)
			// Limit max_tokens to safe value: 20% of actual context limit (32768)
			// This leaves 80% (131072) for input tokens
			const actualContextLimit = 163840
			const safeMaxTokens = Math.min(maxTokens, Math.floor(actualContextLimit * 0.2))
			if (safeMaxTokens < maxTokens) {
				maxTokens = safeMaxTokens
			}
		}

		// For Claude Sonnet 4.5, limit max_tokens to prevent context length errors
		const isClaudeSonnet45 = modelId.includes("claude-sonnet-4.5")
		if (isClaudeSonnet45 && maxTokens) {
			// Claude Sonnet 4.5 has 1000000 context limit
			// Limit max_tokens to safe value: 20% of actual context limit (200000)
			// This leaves 80% (800000) for input tokens
			const actualContextLimit = 1000000
			const safeMaxTokens = Math.min(maxTokens, Math.floor(actualContextLimit * 0.2))
			if (safeMaxTokens < maxTokens) {
				maxTokens = safeMaxTokens
			}
		}

		try {
			const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
				model: modelId,
				messages: [{ role: "user", content: prompt }],
				// Disable tool calls for DeepSeek models to prevent empty content responses
				...(shouldDisableToolCalls && { tool_choice: "none" }),
			}

			if (this.supportsTemperature(modelId)) {
				requestOptions.temperature = this.options.modelTemperature ?? 0
			}

			// GPT-5 models require max_completion_tokens instead of the deprecated max_tokens parameter
			if (isGPT5Model && maxTokens) {
				requestOptions.max_completion_tokens = maxTokens
			} else if (maxTokens) {
				requestOptions.max_tokens = maxTokens
			}

			const response = await this.client.chat.completions.create(requestOptions)
			const message = response.choices[0]?.message
			
			// Handle case where model returned tool_calls but no content
			if (!message?.content && message?.tool_calls && message.tool_calls.length > 0) {
				const toolNames = message.tool_calls
					.map((tc) => tc.function?.name)
					.filter(Boolean)
					.join(", ")
				return `[Model made tool calls: ${toolNames}. Tool calling is not fully supported in this context. Please try with tool_choice: 'none' or use a different model.]`
			}
			
			return message?.content || ""
		} catch (error) {
			throw handleOpenAIError(error, this.providerName)
		}
	}

	/**
	 * CF-X Model: 3-layer workflow handler (streaming)
	 * Calls orchestrator HTTP API or directly calls 3 models
	 */
	private async *handleCFXWorkflow(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
	): ApiStream {
		// Extract task from messages
		const lastMessage = messages[messages.length - 1]
		const task = typeof lastMessage.content === "string" 
			? lastMessage.content 
			: Array.isArray(lastMessage.content)
				? lastMessage.content.map(c => typeof c === "string" ? c : c.text || "").join(" ")
				: ""

		// Try orchestrator HTTP API first
		const orchestratorUrl = this.getOrchestratorUrl()
		
		try {
			const response = await fetch(`${orchestratorUrl}/cf-x`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ task }),
			})

			if (response.ok) {
				const data = await response.json()
				const formatted = data.formatted || 
					`📋 PLAN:\n${data.result?.plan || ""}\n\n💻 CODE:\n${data.result?.code || ""}\n\n🔍 REVIEW:\n${data.result?.review || ""}`
				
				// Stream the formatted result
				for (const char of formatted) {
					yield { type: "text", text: char }
				}
				
				// Yield usage (approximate)
				yield {
					type: "usage",
					inputTokens: 0,
					outputTokens: 0,
					totalCost: 0,
				}
				return
			}
		} catch (error) {
			console.warn("Orchestrator API not available, falling back to direct LiteLLM calls", error)
		}

		// Fallback: Direct 3-layer workflow via LiteLLM
		yield* this.handleCFXDirectWorkflow(task)
	}

	/**
	 * CF-X Model: Direct 3-layer workflow via LiteLLM (fallback)
	 */
	private async *handleCFXDirectWorkflow(task: string): ApiStream {
		const baseURL = this.options.litellmBaseUrl || "http://localhost:4000"
		const apiKey = this.options.litellmApiKey || "dummy-key"
		const litellmUrl = baseURL.replace(/\/v1\/?$/, "") + "/v1"

		try {
			// Step 1: Plan with DeepSeek V3.2
			yield { type: "text", text: "📋 CF-X: Planning with DeepSeek V3.2...\n\n" }
			
			const planResponse = await fetch(`${litellmUrl}/chat/completions`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					model: "openrouter/deepseek/deepseek-v3.2",
					messages: [
						{
							role: "system",
							content: "You are a planning assistant. Break down the given task into a clear, step-by-step plan. Output only the plan, no explanations.",
						},
						{
							role: "user",
							content: `Task: ${task}\n\nCreate a detailed plan:`,
						},
					],
					temperature: 0.7,
					max_tokens: 2000,
				}),
			})

			if (!planResponse.ok) {
				throw new Error(`Plan step failed: ${await planResponse.text()}`)
			}

			const planData = await planResponse.json()
			const plan = planData.choices?.[0]?.message?.content || "Plan oluşturulamadı"

			yield { type: "text", text: `📋 PLAN (DeepSeek V3.2):\n${"=".repeat(60)}\n${plan}\n\n` }

			// Step 2: Code with MiniMax M2.1
			yield { type: "text", text: "💻 CF-X: Coding with MiniMax M2.1...\n\n" }

			const codeResponse = await fetch(`${litellmUrl}/chat/completions`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					model: "openrouter/minimax/minimax-m2.1",
					messages: [
						{
							role: "system",
							content: "You are a coding assistant. Generate code based on the task and plan. Output clean, production-ready code with proper error handling.",
						},
						{
							role: "user",
							content: `Task: ${task}\n\nPlan:\n${plan}\n\nGenerate the code:`,
						},
					],
					temperature: 0.3,
					max_tokens: 4000,
				}),
			})

			if (!codeResponse.ok) {
				throw new Error(`Code step failed: ${await codeResponse.text()}`)
			}

			const codeData = await codeResponse.json()
			const code = codeData.choices?.[0]?.message?.content || "Kod oluşturulamadı"

			yield { type: "text", text: `💻 CODE (MiniMax M2.1):\n${"=".repeat(60)}\n${code}\n\n` }

			// Step 3: Review with Gemini 2.5 Flash
			yield { type: "text", text: "🔍 CF-X: Reviewing with Gemini 2.5 Flash...\n\n" }

			const reviewResponse = await fetch(`${litellmUrl}/chat/completions`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					model: "openrouter/google/gemini-2.5-flash",
					messages: [
						{
							role: "system",
							content: "You are a code reviewer. Review the code against the task and plan. Identify issues, suggest improvements, and verify completeness. Check for bugs, security issues, and best practices.",
						},
						{
							role: "user",
							content: `Task: ${task}\n\nPlan:\n${plan}\n\nCode:\n${code}\n\nReview the code for any errors, bugs, or improvements:`,
						},
					],
					temperature: 0.5,
					max_tokens: 2000,
				}),
			})

			if (!reviewResponse.ok) {
				throw new Error(`Review step failed: ${await reviewResponse.text()}`)
			}

			const reviewData = await reviewResponse.json()
			const review = reviewData.choices?.[0]?.message?.content || "İnceleme yapılamadı"

			yield { type: "text", text: `🔍 REVIEW (Gemini 2.5 Flash):\n${"=".repeat(60)}\n${review}\n\n✅ CF-X Pipeline tamamlandı!` }

			// Yield usage (approximate - sum of all 3 calls)
			yield {
				type: "usage",
				inputTokens: 0,
				outputTokens: 0,
				totalCost: 0,
			}
		} catch (error) {
			throw new Error(`CF-X Pipeline hatası: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	/**
	 * CF-X Model: Non-streaming workflow
	 */
	private async callCFXWorkflow(task: string): Promise<string> {
		const orchestratorUrl = this.getOrchestratorUrl()
		
		try {
			const response = await fetch(`${orchestratorUrl}/cf-x`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ task }),
			})

			if (response.ok) {
				const data = await response.json()
				return data.formatted || 
					`📋 PLAN:\n${data.result?.plan || ""}\n\n💻 CODE:\n${data.result?.code || ""}\n\n🔍 REVIEW:\n${data.result?.review || ""}`
			}
		} catch (error) {
			console.warn("Orchestrator API not available, falling back to direct LiteLLM calls", error)
		}

		// Fallback: Direct 3-layer workflow
		const baseURL = this.options.litellmBaseUrl || "http://localhost:4000"
		const apiKey = this.options.litellmApiKey || "dummy-key"
		const litellmUrl = baseURL.replace(/\/v1\/?$/, "") + "/v1"

		// Step 1: Plan
		const planResponse = await fetch(`${litellmUrl}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model: "openrouter/deepseek/deepseek-v3.2",
				messages: [
					{
						role: "system",
						content: "You are a planning assistant. Break down the given task into a clear, step-by-step plan.",
					},
					{
						role: "user",
						content: `Task: ${task}\n\nCreate a detailed plan:`,
					},
				],
				temperature: 0.7,
				max_tokens: 2000,
			}),
		})

		const planData = await planResponse.json()
		const plan = planData.choices?.[0]?.message?.content || "Plan oluşturulamadı"

		// Step 2: Code
		const codeResponse = await fetch(`${litellmUrl}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model: "openrouter/minimax/minimax-m2.1",
				messages: [
					{
						role: "system",
						content: "You are a coding assistant. Generate code based on the task and plan.",
					},
					{
						role: "user",
						content: `Task: ${task}\n\nPlan:\n${plan}\n\nGenerate the code:`,
					},
				],
				temperature: 0.3,
				max_tokens: 4000,
			}),
		})

		const codeData = await codeResponse.json()
		const code = codeData.choices?.[0]?.message?.content || "Kod oluşturulamadı"

		// Step 3: Review
		const reviewResponse = await fetch(`${litellmUrl}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model: "openrouter/google/gemini-2.5-flash",
				messages: [
					{
						role: "system",
						content: "You are a code reviewer. Review the code against the task and plan.",
					},
					{
						role: "user",
						content: `Task: ${task}\n\nPlan:\n${plan}\n\nCode:\n${code}\n\nReview the code:`,
					},
				],
				temperature: 0.5,
				max_tokens: 2000,
			}),
		})

		const reviewData = await reviewResponse.json()
		const review = reviewData.choices?.[0]?.message?.content || "İnceleme yapılamadı"

		return `🚀 CF-X 3 Katmanlı Model Sonuçları\n\n📋 PLAN (DeepSeek V3.2):\n${"=".repeat(60)}\n${plan}\n\n💻 CODE (MiniMax M2.1):\n${"=".repeat(60)}\n${code}\n\n🔍 REVIEW (Gemini 2.5 Flash):\n${"=".repeat(60)}\n${review}\n\n✅ CF-X Pipeline tamamlandı!`
	}

	/**
	 * Get orchestrator URL from LiteLLM base URL
	 * Assumes orchestrator runs on same host, port 3000
	 */
	private getOrchestratorUrl(): string {
		const baseURL = this.options.litellmBaseUrl || "http://localhost:4000"
		// Extract host from LiteLLM URL and use port 3000 for orchestrator
		try {
			const url = new URL(baseURL)
			return `${url.protocol}//${url.hostname}:3000`
		} catch {
			// Fallback if URL parsing fails
			return "http://localhost:3000"
		}
	}
}

// LiteLLM usage may include an extra field for Anthropic use cases.
interface LiteLLMUsage extends OpenAI.CompletionUsage {
	cache_creation_input_tokens?: number
}
