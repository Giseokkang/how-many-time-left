/**
 * 근무시간 계산 로직 — 순수 함수
 */

/** 해당 월의 모든 평일(월~금) 날짜 문자열 목록 반환 ("YYYY-MM-DD") */
function getWeekdaysInMonth(year, month) {
  const weekdays = [];
  const date = new Date(year, month - 1, 1);
  while (date.getMonth() === month - 1) {
    const day = date.getDay();
    if (day >= 1 && day <= 5) {
      weekdays.push(formatDate(date));
    }
    date.setDate(date.getDate() + 1);
  }
  return weekdays;
}

/** 해당 월에 속하는 공휴일 날짜 목록 반환 */
function getHolidaysInMonth(holidays, year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return Object.keys(holidays).filter((d) => d.startsWith(prefix));
}

/** 의무 근로시간 = (평일 수 - 공휴일 수) × 8 */
function calcRequiredHours(weekdays, holidays) {
  const holidaySet = new Set(holidays);
  const workdays = weekdays.filter((d) => !holidaySet.has(d));
  return workdays.length * 8;
}

/**
 * 남은 근무 정보 계산
 * @param {object} params
 * @param {number} params.accumulatedMinutes - 누적 근무시간 (분 단위)
 * @param {number} params.requiredHours - 의무 근로시간 (시간 단위)
 * @param {string} params.today - 오늘 날짜 "YYYY-MM-DD"
 * @param {string[]} params.weekdays - 해당 월 전체 평일 목록
 * @param {string[]} params.holidays - 해당 월 공휴일 목록
 * @param {boolean} params.excludeFriday - 금요일 제외 여부
 * @returns {{ remainingMinutes: number, remainingDays: number, dailyAverageMinutes: number }}
 */
function calcRemainingInfo({
  accumulatedMinutes,
  requiredHours,
  today,
  weekdays,
  holidays,
  excludeFriday,
}) {
  const holidaySet = new Set(holidays);

  // 오늘 이후(포함) 남은 근무일 = 평일 중 공휴일 아닌 날
  const remainingWorkdays = weekdays.filter(
    (d) => d >= today && !holidaySet.has(d)
  );

  let remainingDays;
  let fridayMinutes = 0;

  if (excludeFriday) {
    // 남은 근무일 중 금요일 찾기 (공휴일이 아닌 금요일만)
    const remainingFridays = remainingWorkdays.filter((d) => {
      return new Date(d + 'T00:00:00').getDay() === 5;
    });
    fridayMinutes = remainingFridays.length * 8 * 60;
    remainingDays = remainingWorkdays.length - remainingFridays.length;
  } else {
    remainingDays = remainingWorkdays.length;
  }

  const requiredMinutes = requiredHours * 60;
  const remainingMinutes = requiredMinutes - accumulatedMinutes - fridayMinutes;

  const dailyAverageMinutes =
    remainingDays > 0 ? remainingMinutes / remainingDays : 0;

  return {
    remainingMinutes: Math.max(0, remainingMinutes),
    remainingDays,
    dailyAverageMinutes: remainingDays > 0 ? Math.max(0, dailyAverageMinutes) : 0,
  };
}

/** "HH:MM" 문자열을 분으로 변환 */
function parseHoursMinutes(str) {
  const match = str.match(/^(\d+):(\d{2})$/);
  if (!match) return null;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

/** 분을 { hours, minutes } 객체로 변환 */
function minutesToHM(totalMinutes) {
  const rounded = Math.round(totalMinutes);
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return { hours: h, minutes: m };
}

/** Date → "YYYY-MM-DD" */
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// content script와 popup 양쪽에서 사용하기 위해 globalThis에 할당
if (typeof globalThis !== 'undefined') {
  globalThis.Calculator = {
    getWeekdaysInMonth,
    getHolidaysInMonth,
    calcRequiredHours,
    calcRemainingInfo,
    parseHoursMinutes,
    minutesToHM,
    formatDate,
  };
}
