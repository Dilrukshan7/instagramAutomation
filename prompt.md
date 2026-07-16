# Knowledge base data-collection prompt

A topic-agnostic master prompt for generating data to paste into the dashboard's
**Knowledge** tab. It is built around how the knowledge base ingests data: the
collection textarea stores **one entry per line**, blank lines are dropped, and
each line is embedded and retrieved on its own (hard-capped at 500 characters).
So the prompt forces the LLM to emit exactly that — clean lines, no numbering,
nothing to strip out before pasting.

## Master prompt (copy into ChatGPT / Claude / Gemini)

```
You are a dataset generator. Produce a clean dataset that I will paste directly
into a knowledge base which stores ONE ENTRY PER LINE and searches each line on
its own.

TOPIC: <<< e.g. "Tamil cinema punch dialogues" | "my coffee shop FAQ" >>>
STYLE / PERSONA: <<< how replies should sound, e.g. "dramatic filmy one-liners"
                     | "warm, factual customer support" >>>
LANGUAGE: <<< e.g. Tamil | Tanglish (Tamil in English letters) | English >>>
HOW MANY: <<< e.g. 60 >>>
MODE: <<< choose one:
        PERSONA = quotable style/reaction lines
        FACTS   = self-contained facts or "Question? Answer." lines >>>

OUTPUT RULES — follow exactly:
- Output ONLY the dataset. No intro, no explanation, no closing text, no headings.
- EXACTLY one entry per line, separated by a single newline.
- NO numbering, NO bullets, NO dashes, NO surrounding quotes, NO markdown.
- NO blank lines between entries.
- Every line must be SELF-CONTAINED and make sense in isolation.
- Keep each line under 400 characters. Shorter and punchier is better.
- No duplicates or near-duplicates. Cover many sub-angles, moods, and situations
  within the topic.
- Write in the specified LANGUAGE and match the STYLE/PERSONA in every line.
- FACTS mode: each line is a complete statement, or one "Question? Answer." on a
  single line.
- PERSONA mode: each line is a natural reply/reaction someone could drop into an
  Instagram comment thread.

Output only the <<HOW MANY>> lines now.
```

## How to use it

1. Fill in the five `<<< >>>` fields and run it in any chat LLM.
2. Copy the raw output (it should already be just lines).
3. In the dashboard → **Knowledge** → open (or create) a collection → paste into
   the **Reference text** box → **Save**. The line count should jump.
4. Set a matching **Style note** on the collection (e.g. *"reply with dramatic,
   filmy energy"*) to reinforce the persona, turn on **Use the knowledge base for
   AI replies**, and use **Test retrieval** to sanity-check.

To grow a collection, re-run the prompt with a different sub-angle and paste the
full set you want (saving replaces the collection's lines).

## Format rules that matter (why this prompt is shaped this way)

- **One entry per line** — the chunker splits on newlines; each line becomes one
  searchable/embeddable entry.
- **No numbering or bullets** — they'd become part of the stored text and pollute
  retrieval.
- **No blank lines** — they're dropped, but keep the output clean anyway.
- **Under 500 characters per line** — anything longer gets split into pieces.

## Example (PERSONA mode, TOPIC "Tamil filmy one-liners", LANGUAGE Tanglish)

```
Vaathi coming! Adangaama varen, atta pola.
Naan late ah vandhaalum, latest ah varuven da.
Enna da, comment pannittu ododra? Nில், pesuvom!
Thala koodum, thalaiva kaatuven — just watch.
Simplaa oru statement: naan solradha panren, panradha solren.
```
