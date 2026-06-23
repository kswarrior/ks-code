import { Effect, Schedule, Schema, Stream } from "effect"
import { HttpClient, HttpClientRequest } from "effect/unstable/http"
import { Catalog } from "../../catalog"
import { PluginV2 } from "../../plugin"
import { ProviderV2 } from "../../provider"
import { ModelV2 } from "../../model"

const OllamaModel = Schema.Struct({
  name: Schema.String,
  details: Schema.Struct({
    family: Schema.optional(Schema.String),
    parameter_size: Schema.optional(Schema.String),
  }),
})

const OllamaTags = Schema.Struct({
  models: Schema.Array(OllamaModel),
})

export const OllamaPlugin = PluginV2.define({
  id: PluginV2.ID.make("ollama"),
  effect: Effect.gen(function* () {
    const catalog = yield* Catalog.Service
    const transform = yield* catalog.transform()
    const httpService = yield* HttpClient.HttpClient

    const refresh = Effect.fn("OllamaPlugin.refresh")(function* () {
      const http = yield* HttpClient.HttpClient.pipe(Effect.orElseSucceed(() => httpService))
      const host = process.env.OLLAMA_HOST || "http://localhost:11434"
      const url = host.endsWith("/") ? host.slice(0, -1) : host

      const response = yield* HttpClientRequest.get(`${url}/api/tags`).pipe(
        HttpClientRequest.setHeader("Accept", "application/json"),
        http.execute,
        Effect.flatMap((res) => res.json),
        Effect.flatMap(Schema.decodeUnknownEffect(OllamaTags)),
        Effect.timeout("5 seconds"),
      ).pipe(Effect.catch(() => Effect.succeed({ models: [] })))

      yield* transform((catalog) => {
        const providerID = ProviderV2.ID.ollama
        catalog.provider.update(providerID, (provider) => {
          provider.id = providerID
          provider.name = "Ollama"
          provider.api = {
            type: "aisdk",
            package: "@ai-sdk/openai-compatible",
            url: `${url}/v1`,
          }
          if (!provider.enabled) {
            provider.enabled = { via: "custom", data: {} }
          }
        })

        for (const model of response.models) {
          const modelID = ModelV2.ID.make(model.name)
          catalog.model.update(providerID, modelID, (draft) => {
            draft.id = modelID
            draft.providerID = providerID
            draft.name = model.name
            draft.family = model.details.family ? ModelV2.Family.make(model.details.family) : undefined
            draft.enabled = true
            draft.status = "active"
            draft.capabilities = {
              tools: true,
              input: ["text"],
              output: ["text"],
            }
            if (draft.limit.context === 0) {
              draft.limit = {
                context: 4096,
                output: 4096,
              }
            }
          })
        }
      })
    })

    yield* refresh()
    yield* refresh().pipe(
      Effect.repeat(Schedule.spaced("1 minute")),
      Effect.forkScoped({ startImmediately: true }),
    )
  }),
})
