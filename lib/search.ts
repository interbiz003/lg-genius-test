import faqData from '../data/faq.json';

interface FaqItem {
  category: string;
  category2: string;
  question: string;
  keywords: string[];
  answer: string;
  url: string;
  urlButton: string;
}

interface SearchResult {
  item: FaqItem;
  score: number;
}

// ═══════════════════════════════════════
// 유사어/동의어 사전
// ═══════════════════════════════════════
const synonymMap: Record<string, string> = {
  // 계약 관련
  '취소금': '해약금', '취소비용': '해약금', '패널티': '해약금', '해약비': '해약금', '중도해지금': '해약금',
  '취소': '해지', '구독취소': '해지', '그만': '해지', '안할래': '해지',
  '이름변경': '명의변경', '명의이전': '명의변경', '명의이관': '명의변경',
  '묶음할인': '결합할인', '다중할인': '결합할인', '2대할인': '결합할인', '두대할인': '결합할인',
  '선불': '선납', '미리납부': '선납',
  '연체': '미납', '밀림': '미납', '밀린요금': '미납', '미납금': '미납', '체납': '미납', '안냄': '미납',
  '완납': '일시불', '한번에': '일시불',
  // 변경 관련
  '카변': '결제변경', '결제수단변경': '결제변경', '결제방법': '결제변경',
  '월요금': '요금', '월납': '요금', '납부금': '요금', '월구독료': '구독료',
  '방관': '방문관리', '방문케어': '방문관리',
  '자관': '자가관리', '자가케어': '자가관리', '셀프관리': '자가관리',
  // 카드 관련
  'KB카드': '국민카드',
  '할인카드': '제휴카드',
  '실적빠지는': '실적제외', '제외항목': '실적제외', '빠지는거': '실적제외',
  '실적조회': '실적확인',
  '자동할인': '청구할인', '빠지는금액': '청구할인',
  // 케어서비스
  '관리서비스': '케어서비스', '방문서비스': '케어서비스',
  '필터교체': '소모품', '교체주기': '소모품',
  '케어쉽': '케어십',
  // 기타
  '배달': '배송', '언제오나': '배송', '언제와': '배송',
  '콜센터': '고객센터', '상담원': '고객센터', '상담사연결': '고객센터',
  // 제품명
  '에어콘': '에어컨', '냉방기': '에어컨',
  '식세': '식기세척기',
  '냉장': '냉장고', '김냉': '김치냉장고',
  '공청': '공기청정기',
  '정수': '정수기',
  // 오타
  '혜액': '혜택',
  '핏엔맥스': '핏앤맥스', '핏엔맥': '핏앤맥',
  // 자연스러운 질문 표현
  '돈 내야': '해약금', '얼마나 내야': '해약금',
  '카드 바꾸': '결제변경', '카드 변경': '결제변경',
  '넘길 수': '명의변경', '넘기고 싶': '명의변경',
  '두 대': '결합할인', '두대': '결합할인', '여러대': '결합할인',
  '밀린': '미납', '안냈': '미납', '못냈': '미납',
  '한번에 내': '일시불', '한꺼번에': '일시불',
  '바꾸고 싶': '변경', '바꿀 수': '변경',
};

function applySynonyms(query: string): string {
  let result = query;
  const sortedKeys = Object.keys(synonymMap).sort((a, b) => b.length - a.length);
  for (const synonym of sortedKeys) {
    if (result.includes(synonym)) {
      result = result.replace(synonym, synonymMap[synonym]);
    }
  }
  return result;
}

export function searchFaq(query: string): SearchResult[] {
  const data = faqData as FaqItem[];
  const queryLower = query.toLowerCase().trim();
  const queryConverted = applySynonyms(queryLower);

  const results: SearchResult[] = [];

  for (const item of data) {
    let score = 0;
    for (const keyword of item.keywords) {
      const kwLower = keyword.toLowerCase();
      if (queryConverted === kwLower) {
        score += 20;
      } else if (queryConverted.includes(kwLower)) {
        score += 10 + kwLower.length;
      } else if (kwLower.includes(queryConverted) && queryConverted.length >= 2) {
        score += 5;
      }
    }
    const questionLower = item.question.toLowerCase();
    if (queryConverted.includes(questionLower) || questionLower.includes(queryConverted)) {
      score += 8;
    }
    if (score > 0) results.push({ item, score });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 5);
}
