// ─────────────────────────────────────────────────────────────────────────
// food-vision — Edge Function for snap-a-picture meal estimation
// ─────────────────────────────────────────────────────────────────────────
// Receives { image: <base64 JPEG, no data: prefix> }, asks Claude Haiku to
// identify the food and estimate macros, returns JSON. Deliberately isolated
// from the shared `ai-chat` function so it can be worked on independently.
//
// The Anthropic key lives ONLY here, as a Supabase secret (Deno.env) — it is
// never shipped in the app bundle. Deploy + set the secret:
//   supabase functions deploy food-vision
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// ─────────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const PROMPT = `Identify the food in this image and estimate its nutrition for the portion shown.
Return ONLY valid JSON, no prose, in exactly this shape:
{"name": string, "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number}
If you cannot identify food, return your best generic estimate for a single plate. Numbers only — no units.`;

function parseMacros(text: string) {
  // Tolerate code fences / stray prose around the JSON object.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('no JSON in model response');
  return JSON.parse(match[0]);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }), { status: 500, headers: CORS });
    }

    const { image } = await req.json();
    if (!image || typeof image !== 'string') {
      return new Response(JSON.stringify({ error: 'missing image' }), { status: 400, headers: CORS });
    }

    const anthropic = new Anthropic({ apiKey });
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
          { type: 'text', text: PROMPT },
        ],
      }],
    });

    const textBlock = resp.content.find((b: { type: string }) => b.type === 'text') as { text?: string } | undefined;
    const macros = parseMacros(textBlock?.text ?? '');

    return new Response(JSON.stringify(macros), { status: 200, headers: CORS });
  } catch (err) {
    console.error('food-vision error:', err);
    return new Response(JSON.stringify({ error: 'estimation failed' }), { status: 500, headers: CORS });
  }
});
