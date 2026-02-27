// scripts/convert-price.js
// Vercel 빌드 시 자동 실행: 구독_CSMS2_YYMMDD.xlsx → price-data.json 변환
// 파일명 규칙: 구독_CSMS2_260220.xlsx (뒤 6자리가 날짜)

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const outputPath = path.join(dataDir, 'price-data.json');

// 구독_CSMS2로 시작하는 xlsx 파일 자동 탐색
const files = fs.readdirSync(dataDir);
const priceFile = files.find(f => f.startsWith('price_') && f.endsWith('.xlsx'));

if (!priceFile) {
  console.error('[오류] price_YYMMDD.xlsx 파일을 찾을 수 없습니다');
  process.exit(1);
}

// 파일명에서 날짜 추출
const dateMatch = priceFile.match(/(\d{6})/);
let priceDate = '';
if (dateMatch) {
  const d = dateMatch[1];
  priceDate = `20${d.substring(0,2)}년 ${d.substring(2,4)}월 ${d.substring(4,6)}일`;
}

console.log(`[변환 시작] ${priceFile} → price-data.json`);
if (priceDate) console.log(`[기준일자] ${priceDate}`);

const inputPath = path.join(dataDir, priceFile);
const workbook = XLSX.readFile(inputPath);
const allData = [];
const seen = new Set();

const sheets = ['전자랜드-업데이트', '홈플러스-업데이트', '이마트-업데이트'];

for (const sheetName of sheets) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) continue;

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[4]) continue;

    const modelFull = String(row[4] || '').trim();
    if (!modelFull) continue;

    const careCombined = String(row[9] || '').trim();
    const key = `${modelFull}|${careCombined}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const safeNum = (val) => {
      if (val === null || val === undefined || val === '' || val === 0) return null;
      const n = Number(val);
      return isNaN(n) ? null : Math.round(n);
    };

    allData.push({
      modelFull,
      product: String(row[3] || '').trim(),
      careType: String(row[6] || '').trim(),
      careDetail: String(row[7] || '').trim(),
      visitCycle: String(row[8] || '').trim(),
      careCombined,
      activation: safeNum(row[10]),
      price3y: safeNum(row[11]),
      price4y: safeNum(row[12]),
      price5y: safeNum(row[15]),
      price6y: safeNum(row[18]),
      prepay30_lump: safeNum(row[21]),
      prepay30_monthly: safeNum(row[22]),
      prepay50_lump: safeNum(row[25]),
      prepay50_monthly: safeNum(row[26]),
    });
  }
}

const output = { priceDate, items: allData };
fs.writeFileSync(outputPath, JSON.stringify(output, null, 0), 'utf-8');
console.log(`[변환 완료] ${allData.length}개 항목 저장됨`);
