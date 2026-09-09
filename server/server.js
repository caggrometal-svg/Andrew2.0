import Fastify from "fastify";
import { generateReply } from "./llm.js";

const app = Fastify({ logger: true });

app.addHook("onRequest", async (request, reply) => {
  reply.header("Access-Control-Allow-Origin", "*");
  reply.header("Access-Control-Allow-Headers", "Content-Type");
  reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (request.method === "OPTIONS") return reply.code(204).send();
});

app.get("/health", async () => ({ ok: true, service: "andrew2-backend" }));

app.post("/api/chat", {
  schema: {
    body: {
      type: "object",
      required: ["messages"],
      properties: {
        messages: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: {
            type: "object",
            required: ["role", "content"],
            properties: {
              role: { type: "string", enum: ["system", "user", "assistant"] },
              content: { type: "string", minLength: 1, maxLength: 12000 },
            },
          },
        },
      },
    },
  },
}, async (request, reply) => {
  try {
    return { message: await generateReply(request.body.messages) };
  } catch (error) {
    request.log.error(error);
    return reply.code(502).send({ error: "No fue posible obtener respuesta del modelo." });
  }
});

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || "0.0.0.0";
app.listen({ port, host }).catch((error) => { app.log.error(error); process.exit(1); });
