import { NextRequest, NextResponse } from 'next/server';
import { searchFaq } from '../../../lib/search';
import { searchPrice, getPriceByModelAndCare, formatPriceResponse, looksLikeModelName } from '../../../lib/priceSearch';

// ═══════════════════════════════════════
// 카카오 오픈빌더 스킬 API (FAQ + 가격표 통합)
// ═══════════════════════════════════════

function makeTextResponse(text: string, buttons: any[] = [], quickReplies: any[] = []) {
  const response: any = {
    version: '2.0',
    template: {
      outputs: [{ simpleText: { text } }],
    },
  };
  if (quickReplies.length > 0) response.template.quickReplies = quickReplies;
  return response;
}

// ── 메인 메뉴 ──
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

// ── 카테고리 메뉴 ──
function categoryMenuResponse(category: string) {
  const categoryMap: Record<string, { title: string; items: { label: string; text: string }[] }> = {
    '계약': {
      title: '📋 계약 관련 어떤 내용이 궁금하세요?',
      items: [
        { label: '미납 정책', text: '미납' }, { label: '해약금', text: '해약금' },
        { label: '변경', text: '변경' }, { label: '명의변경', text: '명의변경' },
        { label: '결합할인', text: '결합할인' }, { label: '해지', text: '해지' },
        { label: '선납', text: '선납' },
      ],
    },
    '제휴카드': {
      title: '💳 어떤 카드사의 정보를 확인하시겠어요?',
      items: [
        { label: '롯데카드', text: '롯데카드' }, { label: '국민카드', text: '국민카드' },
        { label: '신한카드', text: '신한카드' }, { label: '우리카드', text: '우리카드' },
        { label: '청구할인', text: '청구할인' }, { label: '실적제외', text: '실적제외' },
      ],
    },
    '케어서비스': {
      title: '🔧 케어서비스 관련 어떤 내용이 궁금하세요?',
      items: [
        { label: '케어서비스 안내', text: '케어서비스' },
        { label: '소모품', text: '소모품' }, { label: '배송/설치', text: '배송' },
      ],
    },
    '가격표': {
      title: '💰 가격 조회\n\n모델명을 직접 입력해주세요!\n\n💡 예시:\n• A720WA\n• OLED55B4KW\n• AI927BA',
      items: [],
    },
    '기타': {
      title: '❓ 기타 문의 — 아래에서 선택하세요',
      items: [
        { label: '배송/설치', text: '배송' }, { label: '고객센터', text: '고객센터' },
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

// ── 가격 검색 (케어십 선택 버튼) ──
function priceSearchResponse(query: string) {
  const result = searchPrice(query);
  if (!result) return null;

  const careTypes = result.careTypes;

  // 케어십 1개 → 바로 가격 표시
  if (careTypes.length === 1) {
    return makeTextResponse(
      formatPriceResponse(careTypes[0]),
      [],
      [
        { messageText: '처음으로', action: 'message', label: '🏠 처음으로' },
        { messageText: '가격표', action: 'message', label: '💰 다른 모델 조회' },
      ]
    );
  }

  // 케어십 여러 개 → 선택 버튼
  const quickReplies = careTypes.slice(0, 10).map(item => ({
    messageText: `${query} ${item.careType}`,
    action: 'message' as const,
    label: `${item.careType}${item.visitCycle ? '/' + item.visitCycle : ''}`,
  }));
  quickReplies.push({ messageText: '처음으로', action: 'message' as const, label: '🏠 처음으로' });

  const prices = careTypes
    .map(c => c.price6y || c.price5y || c.price4y || c.price3y)
    .filter((p): p is number => p !== null);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = minPrice === maxPrice
    ? `월 ${minPrice.toLocaleString('ko-KR')}원`
    : `월 ${minPrice.toLocaleString('ko-KR')}원 ~ ${maxPrice.toLocaleString('ko-KR')}원`;

  return makeTextResponse(
    `📦 ${result.product} | ${result.modelFull}\n\n이 모델은 ${careTypes.length}가지 케어십 유형이 있어요.\n💰 ${priceRange}\n\n아래에서 케어십 유형을 선택해주세요!`,
    [],
    quickReplies
  );
}

// ── 모델 + 케어십 직접 조회 ──
function priceWithCareResponse(query: string) {
  const parts = query.split(/\s+/);
  if (parts.length < 2) return null;

  const modelPart = parts[0];
  const carePart = parts.slice(1).join(' ');
  const item = getPriceByModelAndCare(modelPart, carePart);
  if (!item) return null;

  return makeTextResponse(
    formatPriceResponse(item),
    [],
    [
      { messageText: '처음으로', action: 'message', label: '🏠 처음으로' },
      { messageText: '가격표', action: 'message', label: '💰 다른 모델 조회' },
    ]
  );
}

// ── FAQ 검색 ──
function searchResultResponse(query: string) {
  const results = searchFaq(query);

  if (results.length === 0) {
    return makeTextResponse(
      `죄송합니다 😅 "${query}"에 대한 답변을 찾지 못했어요.\n\n💡 다른 키워드로 질문해보세요!\n• 예: "미납", "롯데카드 혜택", "해약금"\n• 모델명: "A720WA", "OLED55B4KW"\n\n또는 아래 메뉴에서 찾아보세요!`,
      [],
      [
        { messageText: '계약', action: 'message', label: '📋 계약' },
        { messageText: '제휴카드', action: 'message', label: '💳 제휴카드' },
        { messageText: '가격표', action: 'message', label: '💰 가격 조회' },
        { messageText: '처음으로', action: 'message', label: '🏠 처음으로' },
      ]
    );
  }

  const best = results[0];
  let answer = best.item.answer;

  // URL이 있으면 답변 텍스트 하단에 링크 안내 추가
  if (best.item.url && best.item.url.trim() !== '') {
    const btnLabel = best.item.urlButton || '상세보기';
    answer += `\n\n🔗 ${btnLabel}: ${best.item.url}`;
  }

  const quickReplies: any[] = [];
  for (let i = 1; i < Math.min(results.length, 3); i++) {
    if (results[i].score > 5) {
      const q = results[i].item.question;
      quickReplies.push({
        messageText: q, action: 'message',
        label: `🔍 ${q.length > 12 ? q.substring(0, 12) + '..' : q}`,
      });
    }
  }
  quickReplies.push({ messageText: '처음으로', action: 'message', label: '🏠 처음으로' });
  return makeTextResponse(answer, [], quickReplies);
}

// ═══════════════════════════════════════
// POST 핸들러 (메인 로직)
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
      '판촉': '제휴카드', '제휴카드': '제휴카드', '카드': '제휴카드',
      '케어서비스': '케어서비스', '케어': '케어서비스',
      '가격표': '가격표', '가격 조회': '가격표', '가격조회': '가격표',
      '기타': '기타', '기타 문의': '기타',
    };
    if (categoryKeywords[utterance]) return NextResponse.json(categoryMenuResponse(categoryKeywords[utterance]));

    // 3. 모델명 + 케어십 유형 (예: "A720WA 자가관리")
    const careResponse = priceWithCareResponse(utterance);
    if (careResponse) return NextResponse.json(careResponse);

    // 4. 모델명 단독 (예: "A720WA") → 가격 조회
    if (looksLikeModelName(utterance)) {
      const priceResult = priceSearchResponse(utterance);
      if (priceResult) return NextResponse.json(priceResult);
    }

    // 5. FAQ 키워드 검색
    return NextResponse.json(searchResultResponse(utterance));

  } catch (error) {
    console.error('Chatbot API error:', error);
    return NextResponse.json(
      makeTextResponse(
        '죄송합니다. 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
        [],
        [{ messageText: '처음으로', action: 'message', label: '🏠 처음으로' }]
      )
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'LG 구독 챗봇 API — FAQ + 가격표 통합',
    timestamp: new Date().toISOString(),
  });
}
