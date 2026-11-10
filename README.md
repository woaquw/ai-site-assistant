# AI Site Assistant — one chatbot backend for many websites

An AI chat assistant for small business websites. It answers visitors' questions **only from each business's own knowledge base** and nudges interested visitors to book. One Cloudflare Worker serves several sites; each site sends its `bot` id and gets its own facts, contact details and call to action.

**Live demos** (click the chat button in the bottom-right corner):
- Recording studio: https://woaquw.github.io/quiet-hours-studio/ ("Ask the engineer")
- Pilates studio: https://woaquw.github.io/brightmove-studio/

![Chat widget on the recording studio website](docs/preview.png)

## How it works

```
Website widget (chat.js)  →  Cloudflare Worker (/chat)  →  Workers AI (Llama 3.3 70B)
        ↑  streamed answer (Server-Sent Events)  ←
```

- **Widget** (`chat.js` + `chat.css` in the [Quiet Hours](https://github.com/woaquw/quiet-hours-studio) and [Brightmove](https://github.com/woaquw/brightmove-studio) repos, configured with `window.CHAT_CONFIG`): floating button, suggested questions, typing indicator, answer streamed word by word, "Book a free class" button when the bot suggests booking, mobile full-screen layout, friendly fallback if the service is down.
- **Worker** (`src/index.ts`): validates and trims the conversation, picks the bot, adds its system prompt, calls the model and streams the reply back.
- **Bots** (`src/bots/*.ts`): plain-text facts per business plus contact and booking hints (`src/bots/index.ts`). Adding a new client = one file and one line.

## Safety and cost control

- The model runs on **Cloudflare Workers AI's free daily allowance**: no API key, no card. If the allowance runs out, the widget shows a friendly fallback until the next day.
- **No secrets in the browser:** the website only knows the Worker URL.
- **Origin allow-list:** only the studio website (and localhost) can call the Worker, so other sites can't use up the quota.
- **Limits:** last 12 messages, 600 characters per message, 350 tokens per answer.
- **Guardrails in the prompt:** answer only from the facts, say "not sure" instead of guessing, no invented prices or discounts, no medical advice, stay on topic, ignore "ignore your instructions" requests. Replies in the visitor's language.

Tested examples: "How much for mixing 5 songs with vocal tuning?" → $900 + $200 = $1,100 (matches the site's price builder); gear and session-prep questions; a mic the studio doesn't list → "not sure, please call"; an off-topic coding request (declined); a fake discount request (refused); a question in Russian (answered in Russian).

## Switching the model

The model is set in `wrangler.jsonc` (`MODEL`). Any Workers AI text model works. For a paid model (Claude, GPT), replace the `env.AI.run` call with a call to that provider's API and store the key with `wrangler secret put` — it never reaches the browser.

## Run and deploy

```bash
npm install
npx wrangler login
npm run dev      # local worker
npm run deploy   # publish to <name>.workers.dev
```

The businesses and their facts are fictional; this is a portfolio project.
