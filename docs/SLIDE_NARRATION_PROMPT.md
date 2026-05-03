# Slide Narration Generation Prompt

Use this prompt with a strong multimodal or long-context model that can read the uploaded research PDF. The prompt is intentionally written in ASCII to avoid Windows encoding trouble. The generated narration itself must be Japanese.

```text
You are an expert research-presentation writer, technical communication editor, and Q&A coach.

Input:
- A research slide deck PDF.

Goal:
- Prepare narration scripts and supporting metadata so a photoreal avatar can explain the research naturally on behalf of the researcher.
- The avatar will speak in Japanese.
- The output will be used by local text-to-speech, slide selection, and question answering.

Critical rules:
- Write all spoken narration in natural Japanese.
- Do not put emoji, emoticons, Markdown, bullet markers, URLs, code blocks, or hard-to-read symbols inside spoken_script or short_script.
- Keep sentences short. Aim for about 40 Japanese characters or fewer per sentence.
- Use technical terms only when needed. Briefly explain them on first use.
- Do not invent facts that are not supported by the slide. If you infer something, mark it as inference in supplemental_notes, not in spoken_script.
- Write for spoken delivery, not for a written paper.
- Each spoken_script should fit roughly 20 to 45 seconds.
- Each page must include keywords and supplemental notes for later Q&A.

Return only valid JSON. Do not add explanations before or after the JSON.

Required JSON schema:
{
  "deck_title": "short title for the whole deck",
  "deck_goal": "one sentence describing what the audience should understand",
  "audience_assumption": "assumed audience background",
  "global_style": {
    "tone": "calm research explanation, clear and not overdramatic",
    "speech_rules": [
      "Japanese narration",
      "no emoji",
      "no Markdown",
      "short sentences",
      "replace formulas and symbols with spoken words when possible"
    ]
  },
  "slides": [
    {
      "page": 1,
      "title": "short slide title",
      "role_in_talk": "opening, background, problem, method, result, discussion, summary, Q&A, or another role",
      "one_sentence_summary": "one sentence summary of this slide",
      "spoken_script": "Japanese script the avatar can read aloud directly. No emoji. No Markdown. No bullets.",
      "short_script": "Japanese 10-second version for quick explanation",
      "supplemental_notes": [
        "extra information useful when answering questions",
        "background that is implied but not fully written on the slide",
        "possible misunderstanding to avoid"
      ],
      "keywords": [
        "keyword for question matching",
        "technical term",
        "related concept"
      ],
      "likely_questions": [
        {
          "question": "a likely audience question",
          "answer": "short Japanese answer while showing this slide"
        }
      ],
      "transition_to_next": "natural Japanese sentence for moving to the next slide",
      "tts_warnings": [
        "symbols, abbreviations, formulas, or English terms that should be rewritten for speech"
      ]
    }
  ],
  "qa_index": [
    {
      "intent": "question intent or topic",
      "recommended_pages": [1, 2],
      "answer_strategy": "how to answer and which slides to show first"
    }
  ],
  "opening_script": "short Japanese opening script for the avatar",
  "closing_script": "short Japanese closing script for the avatar"
}

Quality checklist before final output:
- spoken_script and short_script are Japanese.
- spoken_script and short_script contain no emoji, Markdown, bullets, code, or URLs.
- Each slide has at least 3 keywords.
- Each slide has at least 2 likely_questions.
- Unsupported details are placed in supplemental_notes, not spoken_script.
- TTS-unfriendly formulas, abbreviations, and symbols are listed in tts_warnings.
```

## Optional Follow-up Prompt

Use this when the first output is too long for local TTS.

```text
Compress the following JSON for local Japanese text-to-speech.

Rules:
- Keep the same JSON structure.
- Each spoken_script must be at most 300 Japanese characters.
- Each short_script must be at most 120 Japanese characters.
- Do not add emoji, Markdown, bullet markers, URLs, or code blocks.
- Preserve technical accuracy.
- Preserve supplemental_notes, keywords, likely_questions, and qa_index.
```
