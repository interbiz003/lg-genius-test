// scripts/convert-price.js
// Vercel 빌드 시 자동 실행: price.xlsx → price-data.json 변환
// 인터님은 price.xlsx만 교체하면 됩니다!

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, '..', 'data', 'price.xlsx');
const outputPath = path.join(__dirname, '..', 'data', 'price-data.json');

console.log('[변환 시작] price.xlsx → price-data.json');

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

    const careCombined = String(row[10] || '').trim();
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
      careType: String(row[7] || '').trim(),
      careDetail: String(row[8] || '').trim(),
      visitCycle: String(row[9] || '').trim(),
      careCombined,
      price3y: safeNum(row[12]),
      price4y: safeNum(row[13]),
      price5y: safeNum(row[16]),
      price6y: safeNum(row[19]),
      prepay30_lump: safeNum(row[22]),
      prepay30_monthly: safeNum(row[23]),
      prepay50_lump: safeNum(row[26]),
      prepay50_monthly: safeNum(row[27]),
    });
  }
}

fs.writeFileSync(outputPath, JSON.stringify(allData, null, 0), 'utf-8');
console.log(`[변환 완료] ${allData.length}개 항목 저장됨`);
