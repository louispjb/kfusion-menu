// Cloudflare Workers에 붙여넣는 코드입니다 (CLI 필요 없음, 대시보드에서 바로 붙여넣기).
// 역할: present-ai.html이 보낸 학생 메뉴 정보를 받아서, 실제 AI 모델(OpenAI)에게
// "정교한/대범한/설레는" 세 심사위원의 평가를 요청하고 JSON으로 돌려줍니다.
//
// 설정 방법(AI평가_설정방법.md 참고):
// 1) Cloudflare 대시보드 > Workers & Pages > Create Worker
// 2) 편집기에서 기존 코드를 지우고 이 파일 내용을 통째로 붙여넣기 > Deploy
// 3) Worker의 Settings > Variables and Secrets 에서
//    이름: OPENAI_API_KEY / 값: 발급받은 OpenAI API 키 (Secret 타입으로 추가) > Deploy
// 4) 배포된 주소(https://xxxx.workers.dev)를 ai-judge-config.js 의 AI_JUDGE_ENDPOINT에 붙여넣기

export default {
  async fetch(request, env) {
    // 브라우저의 CORS preflight 요청 처리
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }
    if (request.method !== 'POST') {
      return jsonError('POST 요청만 지원합니다.', 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError('요청 본문이 올바른 JSON이 아니에요.', 400);
    }

    const name = String(body?.name || '').slice(0, 60);
    const korean = String(body?.korean || '').slice(0, 60);
    const culture = String(body?.culture || '').slice(0, 60);
    const desc = String(body?.desc || '').slice(0, 400);
    const country = String(body?.country || '').slice(0, 60);

    const prompt =
      '당신은 한식과 세계 문화를 결합한 "K-퓨전 메뉴"를 채점하는 3명의 심사위원입니다.\n' +
      '- 정교한(미각 디자이너): "맛 표현의 구체성"을 평가 (설명이 얼마나 구체적이고 맛이 그려지는가)\n' +
      '- 대범한(불맛 담당): "조합의 대담함"을 평가 (한식과 타문화의 조합이 얼마나 과감하고 참신한가)\n' +
      '- 설레는(문화 큐레이터): "문화적 연결성"을 평가 (한식 요소와 타문화 요소가 설명 속에서 얼마나 자연스럽게 이어지는가)\n\n' +
      '학생이 제출한 메뉴:\n' +
      '메뉴 이름: ' + (name || '(없음)') + '\n' +
      '활용한 한식 요소: ' + (korean || '(없음)') + '\n' +
      '결합한 문화: ' + (culture || '(없음)') + '\n' +
      '설명: ' + (desc || '(없음)') + '\n' +
      '고려한 입맛/국가: ' + (country || '(없음)') + '\n\n' +
      '각 심사위원마다 위 기준에 따라 1~5점 사이 정수 점수와, 학생이 실제로 적은 내용을 근거로 든 ' +
      '한국어 코멘트 한 문장(25~40자, 중고등학생을 격려하는 따뜻하고 구체적인 톤)을 작성하세요.\n' +
      '반드시 아래 JSON 형식으로만 응답하고, 다른 설명이나 텍스트는 절대 포함하지 마세요.\n' +
      '{"judges":[' +
      '{"name":"정교한","score":정수,"comment":"..."},' +
      '{"name":"대범한","score":정수,"comment":"..."},' +
      '{"name":"설레는","score":정수,"comment":"..."}' +
      ']}';

    try {
      const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + env.OPENAI_API_KEY,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          response_format: { type: 'json_object' },
        }),
      });

      if (!aiRes.ok) {
        const errText = await aiRes.text();
        return jsonError('AI 서버 응답 오류: ' + errText.slice(0, 200), 502);
      }

      const data = await aiRes.json();
      const text = data.choices?.[0]?.message?.content || '{}';
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        return jsonError('AI 응답을 JSON으로 해석하지 못했어요.', 502);
      }
      if (!parsed || !Array.isArray(parsed.judges)) {
        return jsonError('AI 응답 형식이 예상과 달라요.', 502);
      }

      return new Response(JSON.stringify(parsed), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    } catch (e) {
      return jsonError('AI 호출 중 오류: ' + e.message, 500);
    }
  },
};

function jsonError(msg, status) {
  return new Response(JSON.stringify({ error: msg }), {
    status: status || 500,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
