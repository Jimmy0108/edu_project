const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const allowedAudioTypes = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/mpeg",
  "audio/mp4",
]);

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "伺服器尚未設定 GROQ_API_KEY；不會把音訊傳送到任何外部服務。" },
      { status: 503 },
    );
  }

  let formData: FormData;
  try { formData = await request.formData(); }
  catch { return Response.json({ error: "請以表單傳送音訊。" }, { status: 400 }); }
  const audio = formData.get("audio");
  if (!(audio instanceof File)) {
    return Response.json({ error: "請提供 audio 檔案。" }, { status: 400 });
  }
  const mediaType = audio.type.split(";")[0];
  if (!allowedAudioTypes.has(mediaType) || !audio.size || audio.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "音訊格式不支援或檔案超過 25 MB。" }, { status: 400 });
  }

  const upstreamForm = new FormData();
  upstreamForm.set("file", audio, audio.name || "lesson-audio.webm");
  upstreamForm.set("model", process.env.GROQ_ASR_MODEL || "whisper-large-v3");
  upstreamForm.set("language", "zh");
  upstreamForm.set("response_format", "verbose_json");
  upstreamForm.append("timestamp_granularities[]", "segment");
  const sequenceValue = Number(formData.get("sequence"));
  const sequence = Number.isInteger(sequenceValue) && sequenceValue >= 0 ? sequenceValue : 0;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      signal: AbortSignal.timeout(25000),
      headers: { Authorization: "Bearer " + apiKey },
      body: upstreamForm,
    });
    if (!response.ok) {
      return Response.json({ error: "語音辨識服務暫時不可用。" }, { status: 502 });
    }
    const body = (await response.json()) as { text?: unknown; segments?: Array<{ avg_logprob?: unknown; compression_ratio?: unknown; no_speech_prob?: unknown }> };
    const text = typeof body.text === "string" ? body.text.trim().slice(0, 2_000) : "";
    const segments = Array.isArray(body.segments) ? body.segments : [];
    const numbers = (key: "avg_logprob" | "compression_ratio" | "no_speech_prob") => segments.map(item => item[key]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const logprobs = numbers("avg_logprob"), compression = numbers("compression_ratio"), noSpeech = numbers("no_speech_prob");
    const avgLogprob = logprobs.length ? Math.min(...logprobs) : null;
    const compressionRatio = compression.length ? Math.max(...compression) : null;
    const noSpeechProbability = noSpeech.length ? Math.max(...noSpeech) : null;
    const silence = !text || (segments.length > 0 && segments.every(item => typeof item.no_speech_prob === "number" && item.no_speech_prob > 0.6 && typeof item.avg_logprob === "number" && item.avg_logprob < -1));
    const review = !silence && ((avgLogprob !== null && avgLogprob < -1) || (compressionRatio !== null && compressionRatio > 2.4));
    return Response.json({ sequence, text, quality: silence ? "silence" : review ? "review" : "accepted", avgLogprob, compressionRatio, noSpeechProbability });
  } catch {
    return Response.json({ error: "語音辨識連線失敗。" }, { status: 502 });
  }
}
