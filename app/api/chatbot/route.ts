import { NextRequest, NextResponse } from 'next/server';
import { searchFaq } from '../../../lib/search';
import { searchPrice, formatPriceResponse, looksLikeModelName } from '../../../lib/priceSearch';

function makeTextResponse(text: string, buttons: any[] = [], quickReplies: any[] = []) {
  const response: any = {
    version: '2.0',
    template: { outputs: [{ simpleText: { text } }] },
  };
  if (quickReplies.length > 0) response.template.quickReplies = quickReplies;
  return response;
}

// ═══════════════════════════════════════
// 메인 메뉴
// ═══════════════════════════════════════
function mainMenuResponse() {
  return makeTextResponse(
    '안녕하세요! 😊 LG전자 구독 상담 도우미입니다.\n\n궁금한 내용을 키워드로 입력하거나\n아래 메뉴를 선택해주세요!\n\n💡 예시:\n• "미납" → 미납 정책 안내\n• "롯데카드 혜택" → 카드 혜택\n• "해약금" → 해약금 안내\n• "A720WA" → 구독료 조회',
    [],
    [
      { messageText: '계약', action: 'message', label: '📋 계약 안내' },
      { messageText: '제휴카드', action: 'message', label: '💳 제휴카드' },
      { messageText: '케어서비스', action: 'message', label: '🔧 케어서비스' },
      { messageText: '가격표', action: 'message', label: '💰 가격 조회' },
      { messageText: '기타', action: 'message', label: '❓ 기타 문의' },
    ]
  );
}

// ═══════════════════════════════════════
// 카테고리 메뉴
// ═══════════════════════════════════════
function categoryMenuResponse(category: string) {
  const categoryMap: Record<string, { title: string; items: { label: string; text: string }[] }> = {
    '계약': {
      title: '📋 계약 관련 어떤 내용이 궁금하세요?',
      items: [
        { label: '미납 정책', text: '미납/납부자 변경' },
        { label: '해약금', text: '해약금' },
        { label: '명의변경', text: '명의변경' },
        { label: '결합할인', text: '결합할인율' },
        { label: '해지', text: '구독해약' },
        { label: '선납', text: '선납 할인율' },
        { label: '일시불 전환', text: '일시불 전환' },
        { label: '이사 시', text: '이삿짐센터' },
        { label: '해외 이민', text: '해외 이민' },
      ],
    },
    '제휴카드': {
      title: '💳 어떤 카드사의 정보를 확인하시겠어요?',
      items: [
        { label: '국민카드', text: '국민카드' },
        { label: '롯데카드', text: '롯데카드' },
        { label: '신한카드', text: '신한카드' },
        { label: '우리카드', text: '우리카드' },
      ],
    },
    '케어서비스': {
      title: '🔧 케어서비스 관련 어떤 내용이 궁금하세요?',
      items: [
        { label: '케어서비스 안내', text: '케어서비스' },
        { label: '배송 분실', text: '배송 분실' },
      ],
    },
    '가격표': {
      title: '💰 가격 조회\n\n모델명을 직접 입력해주세요!\n\n💡 예시:\n• A720WA\n• OLED55B4KW\n• AI927BA',
      items: [],
    },
    '기타': {
      title: '❓ 기타 문의 — 아래에서 선택하세요',
      items: [
        { label: '배송변경', text: '배송변경' },
        { label: '고객센터', text: 'LG 고객센터' },
        { label: '사이트 주소', text: '간편조회' },
      ],
    },
  };
  const cat = categoryMap[category];
  if (!cat) return mainMenuResponse();
  const quickReplies = cat.items.map(item => ({
    messageText: item.text, action: 'message' as const, label: item.label,
  }));
  quickReplies.push({ messageText: '처음으로', action: 'message' as const, label: '🏠 처음으로' });
  return makeTextResponse(cat.title, [], quickReplies);
}

// ═══════════════════════════════════════
// 제휴카드 단계별 플로우
// 제휴카드 → 카드사 선택 → 혜택/실적확인/실적제외
// 각 세부 답변 뒤 → [카드 혜택] [다른 카드 조회]
// ═══════════════════════════════════════
const cardDetailMenu: Record<string, { label: string; text: string }[]> = {
  '국민카드': [
    { label: '혜택/할인', text: '국민카드 할인' },
    { label: '실적확인', text: '국민카드 실적확인' },
    { label: '실적제외', text: '국민카드 실적제외' },
  ],
  '롯데카드': [
    { label: '혜택/할인', text: '롯데카드 혜액' },
    { label: '실적확인', text: '롯데카드 실적 확인' },
    { label: '실적제외', text: '롯데카드 실적제외' },
  ],
  '신한카드': [
    { label: '혜택/할인', text: '신한카드 할인' },
    { label: '실적확인', text: '신한카드 실적확인' },
    { label: '실적제외', text: '신한카드 실적제외' },
    { label: '프로모션', text: '신한카드 프로모션' },
  ],
  '우리카드': [
    { label: '혜택/할인', text: '우리카드 할인' },
    { label: '실적확인', text: '우리카드 실적확인' },
    { label: '실적제외', text: '우리카드 실적제외 항목' },
  ],
};

// 카드사 세부 답변에 해당하는 대표질문 목록 (이 질문이 매칭되면 카드 전용 버튼 사용)
const cardDetailQuestions = new Set([
  '국민카드 할인', '국민카드 실적확인', '국민카드 실적제외',
  '롯데카드 혜액', '롯데카드 실적 확인', '롯데카드 실적제외',
  '신한카드 할인', '신한카드 실적확인', '신한카드 실적제외', '신한카드 프로모션',
  '우리카드 할인', '우리카드 실적확인', '우리카드 실적제외 항목',
]);

// 대표질문 → 어느 카드사 소속인지 매핑
function getCardNameFromQuestion(question: string): string | null {
  for (const [cardName, items] of Object.entries(cardDetailMenu)) {
    for (const item of items) {
      if (item.text === question) return cardName;
    }
  }
  return null;
}

function cardFlowResponse(cardName: string) {
  const menu = cardDetailMenu[cardName];
  if (!menu) return null;

  const quickReplies = menu.map(item => ({
    messageText: item.text, action: 'message' as const, label: item.label,
  }));
  quickReplies.push({ messageText: '제휴카드', action: 'message' as const, label: '💳 다른 카드사' });
  quickReplies.push({ messageText: '처음으로', action: 'message' as const, label: '🏠 처음으로' });

  return makeTextResponse(`💳 ${cardName} — 어떤 정보가 궁금하세요?`, [], quickReplies);
}

// "혜택", "실적제외", "실적확인" → 카드사 선택
function cardReverseFlowResponse(topic: string) {
  const topicLabel: Record<string, string> = {
    '혜택': '혜택/할인', '할인': '혜택/할인', '카드 혜택': '혜택/할인', '카드 할인': '혜택/할인',
    '실적제외': '실적제외', '실적확인': '실적확인',
  };
  const label = topicLabel[topic] || topic;

  return makeTextResponse(
    `💳 ${label} — 어떤 카드사를 확인하시겠어요?`,
    [],
    [
      { messageText: '국민카드', action: 'message', label: '국민카드' },
      { messageText: '롯데카드', action: 'message', label: '롯데카드' },
      { messageText: '신한카드', action: 'message', label: '신한카드' },
      { messageText: '우리카드', action: 'message', label: '우리카드' },
      { messageText: '처음으로', action: 'message', label: '🏠 처음으로' },
    ]
  );
}

// ═══════════════════════════════════════
// 가격 단계별 조회
// ═══════════════════════════════════════
function priceStepResponse(utterance: string) {
  const parts = utterance.split('::');
  const modelQuery = parts[0].trim();
  const gFilter = parts[1]?.trim() || null;
  const hFilter = parts[2]?.trim() || null;
  const iFilter = parts[3]?.trim() || null;

  const result = searchPrice(modelQuery);
  if (!result) return null;

  let items = result.careTypes;
  if (gFilter) items = items.filter(i => i.careType === gFilter);
  if (hFilter) items = items.filter(i => i.careDetail === hFilter);
  if (iFilter) items = items.filter(i => i.visitCycle === iFilter);
  if (items.length === 0) return null;

  if (items.length === 1) {
    return makeTextResponse(formatPriceResponse(items[0]), [], [
      { messageText: '처음으로', action: 'message', label: '🏠 처음으로' },
      { messageText: '가격표', action: 'message', label: '💰 다른 모델 조회' },
    ]);
  }

  if (!gFilter) {
    const gTypes = Array.from(new Set(items.map(i => i.careType).filter(v => v)));
    if (gTypes.length === 1) return priceStepResponse(`${modelQuery}::${gTypes[0]}`);
    const qr = gTypes.slice(0, 10).map(g => ({ messageText: `${modelQuery}::${g}`, action: 'message' as const, label: g }));
    qr.push({ messageText: '처음으로', action: 'message' as const, label: '🏠 처음으로' });
    return makeTextResponse(`📦 ${result.product} | ${result.modelFull}\n\n케어십 유형을 선택해주세요!`, [], qr);
  }
  if (!hFilter) {
    const hTypes = Array.from(new Set(items.map(i => i.careDetail).filter(v => v)));
    if (hTypes.length <= 1) return priceStepResponse(`${modelQuery}::${gFilter}::${hTypes[0] || ''}`);
    const qr = hTypes.slice(0, 10).map(h => ({ messageText: `${modelQuery}::${gFilter}::${h}`, action: 'message' as const, label: h }));
    qr.push({ messageText: '처음으로', action: 'message' as const, label: '🏠 처음으로' });
    return makeTextResponse(`📦 ${result.product} | ${result.modelFull}\n🔧 케어십: ${gFilter}\n\n세부 유형을 선택해주세요!`, [], qr);
  }
  if (!iFilter) {
    const iTypes = Array.from(new Set(items.map(i => i.visitCycle).filter(v => v)));
    if (iTypes.length <= 1) {
      return makeTextResponse(formatPriceResponse(items[0]), [], [
        { messageText: '처음으로', action: 'message', label: '🏠 처음으로' },
        { messageText: '가격표', action: 'message', label: '💰 다른 모델 조회' },
      ]);
    }
    const qr = iTypes.slice(0, 10).map(iv => ({ messageText: `${modelQuery}::${gFilter}::${hFilter}::${iv}`, action: 'message' as const, label: iv }));
    qr.push({ messageText: '처음으로', action: 'message' as const, label: '🏠 처음으로' });
    return makeTextResponse(`📦 ${result.product} | ${result.modelFull}\n🔧 케어십: ${gFilter} > ${hFilter}\n\n방문주기를 선택해주세요!`, [], qr);
  }

  return makeTextResponse(formatPriceResponse(items[0]), [], [
    { messageText: '처음으로', action: 'message', label: '🏠 처음으로' },
    { messageText: '가격표', action: 'message', label: '💰 다른 모델 조회' },
  ]);
}

// ═══════════════════════════════════════
// 바로 답변 생성
// ═══════════════════════════════════════
function directAnswer(results: { item: any; score: number }[]) {
  const best = results[0];
  let answer = best.item.answer;
  if (best.item.url && best.item.url.trim() !== '') {
    answer += `\n\n🔗 ${best.item.urlButton || '상세보기'}: ${best.item.url}`;
  }

  const quickReplies: any[] = [];
  const question = best.item.question;

  // ── 카드 세부 답변이면 → [해당 카드 혜택] [다른 카드 조회] ──
  if (cardDetailQuestions.has(question)) {
    const cardName = getCardNameFromQuestion(question);
    if (cardName) {
      // 해당 카드 혜택 버튼 (현재 답변이 혜택이 아닌 경우만)
      const benefitItem = cardDetailMenu[cardName]?.find(i => i.label === '혜택/할인');
      if (benefitItem && benefitItem.text !== question) {
        quickReplies.push({ messageText: benefitItem.text, action: 'message', label: `${cardName} 혜택` });
      }
      quickReplies.push({ messageText: cardName, action: 'message', label: `💳 ${cardName} 다른 메뉴` });
      quickReplies.push({ messageText: '제휴카드', action: 'message', label: '💳 다른 카드사' });
    }
  }
  // ── 엑셀에서 설정한 버튼이 있으면 사용 ──
  else if (best.item.quickButtons && best.item.quickButtons.length > 0) {
    for (const btn of best.item.quickButtons.slice(0, 5)) {
      quickReplies.push({
        messageText: btn, action: 'message',
        label: btn.length > 14 ? btn.substring(0, 14) + '..' : btn,
      });
    }
  }
  // ── 없으면 검색 결과에서 관련 질문 추천 ──
  else {
    for (let i = 1; i < Math.min(results.length, 3); i++) {
      if (results[i].score > 5) {
        const q = results[i].item.question;
        quickReplies.push({
          messageText: q, action: 'message',
          label: `🔍 ${q.length > 12 ? q.substring(0, 12) + '..' : q}`,
        });
      }
    }
  }

  quickReplies.push({ messageText: '처음으로', action: 'message', label: '🏠 처음으로' });
  return makeTextResponse(answer, [], quickReplies);
}

// ═══════════════════════════════════════
// FAQ 검색
// ═══════════════════════════════════════
function searchResultResponse(query: string) {
  const results = searchFaq(query);

  if (results.length === 0) {
    return makeTextResponse(
      `😅 입력하신 내용에 대한 답변을 찾지 못했어요.\n\n💡 이렇게 질문해보세요!\n• 키워드로 검색: "해약금", "미납", "결합할인"\n• 카드사 혜택: "롯데카드 혜택", "신한카드 실적"\n• 구독료 조회: 모델명 입력 (예: A720WA)\n\n아래 버튼을 눌러보셔도 좋아요!`,
      [],
      [
        { messageText: '간편조회', action: 'message', label: '🔗 사이트 주소' },
        { messageText: '제휴카드', action: 'message', label: '💳 제휴카드' },
        { messageText: 'LG 고객센터', action: 'message', label: '📞 고객센터' },
        { messageText: '처음으로', action: 'message', label: '🏠 처음으로' },
      ]
    );
  }

  const best = results[0];

  // 1위가 확실하면 바로 답변
  if (best.score >= 30) {
    return directAnswer(results);
  }

  // 충돌 감지
  if (results.length >= 2) {
    const scoreRatio = results[1].score / best.score;
    if (scoreRatio >= 0.7) {
      const threshold = best.score * 0.6;
      const candidates = results.filter(r => r.score >= threshold).slice(0, 5);
      if (candidates.length >= 2) {
        const quickReplies = candidates.map(c => ({
          messageText: c.item.question,
          action: 'message' as const,
          label: c.item.question.length > 14 ? c.item.question.substring(0, 14) + '..' : c.item.question,
        }));
        quickReplies.push({ messageText: '처음으로', action: 'message' as const, label: '🏠 처음으로' });
        return makeTextResponse(`🔍 "${query}" 관련 항목이 여러 개 있어요.\n어떤 내용이 궁금하세요?`, [], quickReplies);
      }
    }
  }

  return directAnswer(results);
}

// ═══════════════════════════════════════
// 특수 매핑 (버튼에서 들어오는 텍스트 → 원하는 답변으로 연결)
// ═══════════════════════════════════════
const specialMapping: Record<string, () => ReturnType<typeof makeTextResponse>> = {
  // 계약 > 결합할인 → 결합할인율 답변 + 버튼
  '결합할인': () => {
    const results = searchFaq('결합할인율');
    if (results.length > 0) {
      const item = results[0].item;
      let answer = item.answer;
      if (item.url) answer += `\n\n🔗 ${item.urlButton || '상세보기'}: ${item.url}`;
      return makeTextResponse(answer, [], [
        { messageText: '결합할인 해지', action: 'message', label: '결합할인 해지' },
        { messageText: '선납 할인율', action: 'message', label: '선납할인' },
        { messageText: '처음으로', action: 'message', label: '🏠 처음으로' },
      ]);
    }
    return searchResultResponse('결합할인율');
  },
  // 계약 > 선납 → 선납 할인율 답변 + 버튼
  '선납': () => {
    const results = searchFaq('선납 할인율');
    if (results.length > 0) {
      const item = results[0].item;
      let answer = item.answer;
      if (item.url) answer += `\n\n🔗 ${item.urlButton || '상세보기'}: ${item.url}`;
      return makeTextResponse(answer, [], [
        { messageText: '선납 할부', action: 'message', label: '선납금 결제' },
        { messageText: '선납금 명의', action: 'message', label: '선납금 결제 명의' },
        { messageText: '선납금 실적', action: 'message', label: '선납금 실적' },
        { messageText: '처음으로', action: 'message', label: '🏠 처음으로' },
      ]);
    }
    return searchResultResponse('선납 할인율');
  },
};

// ═══════════════════════════════════════
// POST 핸들러
// ═══════════════════════════════════════
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const utterance = body?.userRequest?.utterance?.trim() || '';
    if (!utterance) return NextResponse.json(mainMenuResponse());

    // 1. 메인 메뉴
    const menuKeywords = ['처음으로', '홈', '메인', '메뉴', '시작', '도움말'];
    if (menuKeywords.includes(utterance)) return NextResponse.json(mainMenuResponse());

    // 2. 카테고리 메뉴
    const categoryKeywords: Record<string, string> = {
      '계약': '계약', '계약 안내': '계약',
      '판촉': '제휴카드', '제휴카드': '제휴카드',
      '케어서비스': '케어서비스 메뉴', '케어': '케어서비스 메뉴',
      '가격표': '가격표', '가격 조회': '가격표', '가격조회': '가격표',
      '기타': '기타', '기타 문의': '기타',
    };
    if (categoryKeywords[utterance]) {
      const cat = categoryKeywords[utterance];
      if (cat === '케어서비스 메뉴') return NextResponse.json(categoryMenuResponse('케어서비스'));
      return NextResponse.json(categoryMenuResponse(cat));
    }

    // 3. 특수 매핑 (결합할인, 선납 등)
    if (specialMapping[utterance]) {
      return NextResponse.json(specialMapping[utterance]());
    }

    // 4. 제휴카드 단계별 플로우
    if (cardDetailMenu[utterance]) {
      return NextResponse.json(cardFlowResponse(utterance)!);
    }
    const reverseCardKeywords = ['혜택', '할인', '카드 혜택', '카드 할인', '실적제외', '실적확인'];
    if (reverseCardKeywords.includes(utterance)) {
      return NextResponse.json(cardReverseFlowResponse(utterance));
    }

    // 5. 가격 단계별 조회
    if (utterance.includes('::')) {
      const stepResult = priceStepResponse(utterance);
      if (stepResult) return NextResponse.json(stepResult);
    }

    // 6. 모델명 → 가격 조회
    if (looksLikeModelName(utterance)) {
      const stepResult = priceStepResponse(utterance);
      if (stepResult) return NextResponse.json(stepResult);
    }

    // 7. FAQ 키워드 검색
    return NextResponse.json(searchResultResponse(utterance));

  } catch (error) {
    console.error('Chatbot API error:', error);
    return NextResponse.json(
      makeTextResponse('죄송합니다. 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', [],
        [{ messageText: '처음으로', action: 'message', label: '🏠 처음으로' }])
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', message: 'LG 구독 챗봇 API v5', timestamp: new Date().toISOString() });
}
