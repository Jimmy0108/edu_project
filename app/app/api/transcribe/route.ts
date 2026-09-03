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

  const formData = await request.formData();
  const audio = formData.get("audio");
  if (!(audio instanceof File)) {
    return Response.json({ error: "請提供 audio 檔案。" }, { status: 400 });
  }
  if (!allowedAudioTypes.has(audio.type) || audio.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "音訊格式不支援或檔案超過 25 MB。" }, { status: 400 });
  }

  const upstreamForm = new FormData();
  upstreamForm.set("file", audio, audio.name || "lesson-audio.webm");
  upstreamForm.set("model", process.env.GROQ_ASR_MODEL || "whisper-large-v3");
  upstreamForm.set("language", "zh");
  upstreamForm.set("response_format", "json");

  try {
    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey },
      body: upstreamForm,
    });
    if (!response.ok) {
      return Response.json({ error: "語音辨識服務暫時不可用。" }, { status: 502 });
    }
    const body = (await response.json()) as { text?: unknown };
    const text = typeof body.text === "string" ? body.text.trim().slice(0, 2_000) : "";
    if (!text) return Response.json({ error: "未辨識到可用文字。" }, { status: 422 });
    return Response.json({ text });
  } catch {
    return Response.json({ error: "語音辨識連線失敗。" }, { status: 502 });
  }
}
