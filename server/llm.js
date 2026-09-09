import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = process.env.OPENAI_MODEL || "gpt-5-mini";

export async function generateReply(messages) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY no está configurada.");
  const response = await client.responses.create({
    model,
    input: messages.map((message) => ({ role: message.role, content: message.content })),
  });
  return response.output_text?.trim() || "No recibí contenido de respuesta del modelo.";
}
