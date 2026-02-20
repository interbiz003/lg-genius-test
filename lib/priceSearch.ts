import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════
// 타입 정의
// ═══════════════════════════════════════
interface PriceItem {
  modelFull: string;
  product: string;
  careType: string;
  careDetail: string;
  visitCycle: string;
  careCombined: string;
  price3y: number | null;
  price4y: number | null;
  price5y: number | null;
  price6y: number | null;
  prepay30_lump: number | null;
  prepay30_monthly: number | null;
  prepay50_lump: number | null;
  prepay50_monthly: number | null;
}

interface ModelMatch {
  modelFull: string;
  product: string;
  careTypes: PriceItem[];
}

// ═══════════════════════════════════════
// 엑셀 데이터 로드 (서버 시작 시 1회 읽기, 캐싱)
// ═══════════════════════════════════════
let cachedData: PriceItem[] | null = null;
let priceDate: string = '';  // 가격표 기준일자

function loadPriceData(): PriceItem[] {
  if (cachedData) return cachedData;

  // 파일명 패턴: 구독_CSMS2_YYMMDD.xlsx
  const dataDir = path.join(process.cwd(), 'data');
  const files = fs.readdirSync(dataDir);
  const priceFile = files.find(f => f.startsWith('구독_CSMS2') && f.endsWith('.xlsx'));

  if (!priceFile) {
    console.error('[가격표] 파일을 찾을 수 없습니다');
    cachedData = [];
    return cachedData;
  }

  // 파일명에서 날짜 추출 (YYMMDD)
  const dateMatch = priceFile.match(/(\d{6})/);
  if (dateMatch) {
    const d = dateMatch[1];
    const yy = d.substring(0, 2);
    const mm = d.substring(2, 4);
    const dd = d.substring(4, 6);
    priceDate = `20${yy}년 ${mm}월 ${dd}일`;
  }

  const filePath = path.join(dataDir, priceFile);
  const workbook = XLSX.readFile(filePath);

  const allData: PriceItem[] = [];
  const seen = new Set<string>();

  // 3개 시트 모두 읽기 (가격 동일하므로 중복 제거)
  const sheets = ['전자랜드-업데이트', '홈플러스-업데이트', '이마트-업데이트'];

  for (const sheetName of sheets) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;

    // 시트를 2차원 배열로 변환 (헤더 없이)
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    // 데이터는 5행(인덱스4)부터 시작
    for (let i = 4; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[4]) continue; // E열(모델코드) 없으면 스킵

      const modelFull = String(row[4] || '').trim();
      if (!modelFull) continue;

      const careType = String(row[7] || '').trim();   // H열: 케어십형태
      const careCombined = String(row[10] || '').trim(); // K열: 구분자

      // 중복 제거 (같은 모델+케어십 = 같은 가격)
      const key = `${modelFull}|${careCombined}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const safeNum = (val: any): number | null => {
        if (val === null || val === undefined || val === '' || val === 0) return null;
        const n = Number(val);
        return isNaN(n) ? null : Math.round(n);
      };

      allData.push({
        modelFull,
        product: String(row[3] || '').trim(),          // D열: 제품
        careType,
        careDetail: String(row[8] || '').trim(),        // I열: 케어십구분
        visitCycle: String(row[9] || '').trim(),         // J열: 방문주기
        careCombined,
        price3y: safeNum(row[12]),       // M열: 3년 기본요금
        price4y: safeNum(row[13]),       // N열: 4년 기본요금
        price5y: safeNum(row[16]),       // Q열: 5년 기본요금
        price6y: safeNum(row[19]),       // T열: 6년 기본요금
        prepay30_lump: safeNum(row[22]), // W열: 30% 선납금
        prepay30_monthly: safeNum(row[23]), // X열: 30% 월구독
        prepay50_lump: safeNum(row[26]), // AA열: 50% 선납금
        prepay50_monthly: safeNum(row[27]), // AB열: 50% 월구독
      });
    }
  }

  cachedData = allData;
  console.log(`[가격표] ${allData.length}개 항목 로드 완료`);
  return allData;
}

// ═══════════════════════════════════════
// 모델명 정규화
// ═══════════════════════════════════════
function normalizeModel(input: string): string {
  return input.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9\-]/g, '');
}

function extractBaseModel(fullCode: string): string {
  let code = fullCode.toUpperCase().trim();
  const dotIndex = code.lastIndexOf('.');
  if (dotIndex > 0) code = code.substring(0, dotIndex);
  return code;
}

// ═══════════════════════════════════════
// 모델명으로 검색
// ═══════════════════════════════════════
export function searchPrice(query: string): ModelMatch | null {
  const data = loadPriceData();
  const queryNorm = normalizeModel(query);

  if (queryNorm.length < 3) return null;

  // 1단계: 정확한 전체 모델코드 매칭
  const exactMatches = data.filter(item => normalizeModel(item.modelFull) === queryNorm);
  if (exactMatches.length > 0) return groupByModel(exactMatches);

  // 2단계: 접미사 제거 후 매칭
  const baseMatches = data.filter(item => {
    const base = normalizeModel(extractBaseModel(item.modelFull));
    return base === queryNorm || base.includes(queryNorm) || queryNorm.includes(base);
  });
  if (baseMatches.length > 0) return groupByModel(baseMatches);

  // 3단계: 부분 매칭
  const partialMatches = data.filter(item => {
    const full = normalizeModel(item.modelFull);
    const base = normalizeModel(extractBaseModel(item.modelFull));
    return full.includes(queryNorm) || base.includes(queryNorm);
  });
  if (partialMatches.length > 0) {
    const models = Array.from(new Set(partialMatches.map(m => extractBaseModel(m.modelFull))));
    if (models.length <= 5) return groupByModel(partialMatches);
  }

  return null;
}

// ═══════════════════════════════════════
// 그룹핑
// ═══════════════════════════════════════
function groupByModel(items: PriceItem[]): ModelMatch {
  const first = items[0];
  const seen = new Set<string>();
  const uniqueItems: PriceItem[] = [];
  for (const item of items) {
    if (!seen.has(item.careCombined)) {
      seen.add(item.careCombined);
      uniqueItems.push(item);
    }
  }
  return { modelFull: first.modelFull, product: first.product, careTypes: uniqueItems };
}

// ═══════════════════════════════════════
// 모델 + 케어십 조회
// ═══════════════════════════════════════
export function getPriceByModelAndCare(query: string, careType: string): PriceItem | null {
  const data = loadPriceData();
  const queryNorm = normalizeModel(query);

  return data.find(item => {
    const full = normalizeModel(item.modelFull);
    const base = normalizeModel(extractBaseModel(item.modelFull));
    const modelMatch = full === queryNorm || base === queryNorm ||
                       full.includes(queryNorm) || base.includes(queryNorm);
    const careMatch = item.careType === careType || item.careCombined.includes(careType);
    return modelMatch && careMatch;
  }) || null;
}

// ═══════════════════════════════════════
// 가격 포맷팅
// ═══════════════════════════════════════
export function formatPrice(price: number | null): string {
  if (price === null || price === 0) return '-';
  return price.toLocaleString('ko-KR') + '원';
}

export function formatPriceResponse(item: PriceItem): string {
  const lines: string[] = [];

  lines.push(`📦 ${item.product} | ${item.modelFull}`);
  lines.push(`🔧 케어십: ${item.careCombined}`);
  if (priceDate) {
    lines.push(`📅 ${priceDate} 기준`);
  }
  lines.push('');

  lines.push('💰 월 구독료 (기본요금)');
  if (item.price6y) lines.push(`  • 6년: ${formatPrice(item.price6y)}`);
  if (item.price5y) lines.push(`  • 5년: ${formatPrice(item.price5y)}`);
  if (item.price4y) lines.push(`  • 4년: ${formatPrice(item.price4y)}`);
  if (item.price3y) lines.push(`  • 3년: ${formatPrice(item.price3y)}`);

  if (item.prepay30_monthly || item.prepay50_monthly) {
    lines.push('');
    lines.push('📋 선납 시');
    if (item.prepay30_lump && item.prepay30_monthly) {
      lines.push(`  • 30%: 선납금 ${formatPrice(item.prepay30_lump)} / 월 ${formatPrice(item.prepay30_monthly)}`);
    }
    if (item.prepay50_lump && item.prepay50_monthly) {
      lines.push(`  • 50%: 선납금 ${formatPrice(item.prepay50_lump)} / 월 ${formatPrice(item.prepay50_monthly)}`);
    }
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════
// 모델명 판별
// ═══════════════════════════════════════
export function looksLikeModelName(query: string): boolean {
  const cleaned = query.trim().toUpperCase();
  const alphanumeric = cleaned.replace(/[^A-Z0-9]/g, '');
  return alphanumeric.length >= 3 && /[A-Z]/.test(cleaned) && /[0-9]/.test(cleaned);
}
