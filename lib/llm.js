// 可选的大模型接入：设置 LLM_API_KEY 后，AI 会在统计结论之外再生成一段"自由解读"。
// 未配置或调用失败时自动回退到内置规则引擎，Demo 离线也能完整运行。

export function llmConfigured() {
  return !!process.env.LLM_API_KEY;
}

export async function enrichWithLLM(result, datasetInfo) {
  const key = process.env.LLM_API_KEY;
  if (!key) return null;
  const baseUrl = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.LLM_MODEL || 'deepseek-v4-flash';
  const prompt = {
    question: result.question,
    statisticalAnswer: result.paragraphs,
    dataset: {
      rows: datasetInfo.totalRows,
      columns: datasetInfo.columns,
    },
  };
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.5,
        max_tokens: 420,
        messages: [
          {
            role: 'system',
            content:
              '你是一个数据科学助手。用户通过自然语言向数据问答系统提问，系统已给出基于真实统计的结论。请基于这些统计结论，用通俗、有洞察力的中文补充一段 3-5 句的“自由解读”：指出业务含义、值得关注的点或行动建议。不要编造统计结论之外的数字。',
          },
          { role: 'user', content: JSON.stringify(prompt) },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch {
    return null; // 离线/失败时保持规则引擎输出
  }
}
