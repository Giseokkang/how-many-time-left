// 실행: node test/calculator.check.js
const assert = require('node:assert');
require('../lib/calculator.js');
const Cal = globalThis.Calculator;

const weekdays = Cal.getWeekdaysInMonth(2026, 10);
const holidays = ['2026-10-05', '2026-10-09'];
const base = {
  accumulatedMinutes: 118 * 60 + 14,
  requiredHours: 160,
  pageRemainingDays: null,
  today: '2026-10-26',
  weekdays,
  holidays,
  excludeFriday: true,
};

// 휴가 없음: 33:46 / 4일
let r = Cal.calcRemainingInfo(base);
assert.strictEqual(r.remainingMinutes, 33 * 60 + 46);
assert.strictEqual(r.remainingDays, 4);
assert.strictEqual(r.todayVacationMinutes, 0);

// 10/28 반차 4h: 일수 유지, 크레딧 기준 일평균 = (33:46 + 4:00) / 4
r = Cal.calcRemainingInfo({ ...base, vacations: [{ date: '2026-10-28', hours: 4 }] });
assert.strictEqual(r.remainingDays, 4);
assert.strictEqual(r.dailyAverageMinutes, (33 * 60 + 46 + 240) / 4);

// 오늘 반반차: 오늘 실근무 = 일평균 - 2h
r = Cal.calcRemainingInfo({ ...base, vacations: [{ date: '2026-10-26', hours: 2 }] });
assert.strictEqual(r.todayVacationMinutes, 120);

// 오늘 퇴근 완료 → 오늘 반반차는 무시
r = Cal.calcRemainingInfo({ ...base, todayDone: true, vacations: [{ date: '2026-10-26', hours: 2 }] });
assert.strictEqual(r.todayVacationMinutes, 0);
assert.strictEqual(r.dailyAverageMinutes, (33 * 60 + 46) / 3);

// 8h 휴가: 근무일에서 제외 (003 동작)
r = Cal.calcRemainingInfo({ ...base, vacations: [{ date: '2026-10-28', hours: 8 }] });
assert.strictEqual(r.remainingDays, 3);

// 금요일 제외 ON + 금요일 반차: 금요일 고정분 4h 만 차감
r = Cal.calcRemainingInfo({ ...base, vacations: [{ date: '2026-10-30', hours: 4 }] });
assert.strictEqual(r.remainingMinutes, 33 * 60 + 46 + 240);
assert.strictEqual(r.remainingDays, 4);

// 과거 부분 휴가는 영향 없음
r = Cal.calcRemainingInfo({ ...base, vacations: [{ date: '2026-10-22', hours: 2 }] });
assert.strictEqual(r.dailyAverageMinutes, (33 * 60 + 46) / 4);

console.log('ok');
