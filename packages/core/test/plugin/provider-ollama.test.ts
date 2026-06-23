import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import { Catalog } from "@opencode-ai/core/catalog"
import { ModelV2 } from "@opencode-ai/core/model"
import { PluginV2 } from "@opencode-ai/core/plugin"
import { OllamaPlugin } from "@opencode-ai/core/plugin/provider/ollama"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { it } from "./provider-helper"

describe("OllamaPlugin", () => {
  it.effect("fetches models from Ollama and updates the catalog", () =>
    Effect.gen(function* () {
      const plugin = yield* PluginV2.Service
      const catalog = yield* Catalog.Service

      const mockHttp = HttpClient.make((request) =>
        Effect.gen(function* () {
          return HttpClientResponse.fromWeb(
            request,
            new Response(
              JSON.stringify({
                models: [
                  {
                    name: "llama3:latest",
                    details: { family: "llama", parameter_size: "8b" },
                  },
                ],
              }),
            ),
          )
        }),
      )

      yield* plugin.add({
        ...OllamaPlugin,
        effect: OllamaPlugin.effect.pipe(Effect.provideService(HttpClient.HttpClient, mockHttp)) as any,
      })

      const provider = yield* catalog.provider.get(ProviderV2.ID.ollama)
      expect(provider.name).toBe("Ollama")
      expect(provider.api.type).toBe("aisdk")
      if (provider.api.type === "aisdk") {
        expect(provider.api.package).toBe("@ai-sdk/openai-compatible")
        expect(provider.api.url).toBe("http://localhost:11434/v1")
      }

      const model = yield* catalog.model.get(ProviderV2.ID.ollama, ModelV2.ID.make("llama3:latest"))
      expect(model.name).toBe("llama3:latest")
      expect(model.enabled).toBe(true)
    }),
  )

  it.effect("respects OLLAMA_HOST environment variable", () =>
    Effect.gen(function* () {
      const plugin = yield* PluginV2.Service
      const catalog = yield* Catalog.Service

      process.env.OLLAMA_HOST = "http://vps-ollama:11434"

      const mockHttp = HttpClient.make((request) =>
        Effect.gen(function* () {
          expect(request.url).toBe("http://vps-ollama:11434/api/tags")
          return HttpClientResponse.fromWeb(
            request,
            new Response(
              JSON.stringify({
                models: [
                  {
                    name: "mistral:latest",
                    details: { family: "mistral", parameter_size: "7b" },
                  },
                ],
              }),
            ),
          )
        }),
      )

      yield* plugin.add({
        ...OllamaPlugin,
        effect: OllamaPlugin.effect.pipe(Effect.provideService(HttpClient.HttpClient, mockHttp)) as any,
      })

      const provider = yield* catalog.provider.get(ProviderV2.ID.ollama)
      if (provider.api.type === "aisdk") {
        expect(provider.api.url).toBe("http://vps-ollama:11434/v1")
      }

      const model = yield* catalog.model.get(ProviderV2.ID.ollama, ModelV2.ID.make("mistral:latest"))
      expect(model.name).toBe("mistral:latest")

      delete process.env.OLLAMA_HOST
    }),
  )
})
