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
 * @param {number|null} params.pageRemainingDays - 페이지에서 읽은 남은 근무일 (휴가 반영됨)
 * @param {string} params.today - 오늘 날짜 "YYYY-MM-DD"
 * @param {string[]} params.weekdays - 해당 월 전체 평일 목록
 * @param {string[]} params.holidays - 해당 월 공휴일 목록
 * @param {boolean} params.excludeFriday - 금요일 제외 여부
 * @param {boolean} [params.todayDone] - 오늘 퇴근 완료 여부 (남은 근무일에서 오늘 제외)
 * @returns {{ remainingMinutes: number, remainingDays: number, dailyAverageMinutes: number }}
 */
function calcRemainingInfo({
  accumulatedMinutes,
  requiredHours,
  pageRemainingDays,
  today,
  weekdays,
  holidays,
  excludeFriday,
  todayDone = false,
}) {
  const holidaySet = new Set(holidays);

  // 오늘 이후(포함) 남은 근무일 (달력 기반, 폴백용)
  const calcWorkdays = weekdays.filter(
    (d) => d >= today && !holidaySet.has(d)
  );

  // 남은 근무일: 페이지 값 우선 (휴가 반영), 없으면 달력 계산
  const totalRemainingDays = pageRemainingDays ?? calcWorkdays.length;

  let remainingDays;
  let fridayMinutes = 0;

  if (excludeFriday) {
    // 남은 근무일 중 금요일 수 (달력 기반으로 추정)
    const calcFridays = calcWorkdays.filter((d) => {
      return new Date(d + 'T00:00:00').getDay() === 5;
    });
    const fridayCount = calcFridays.length;
    fridayMinutes = fridayCount * 8 * 60;
    remainingDays = totalRemainingDays - fridayCount;
  } else {
    remainingDays = totalRemainingDays;
  }

  // 오늘 퇴근 완료 시 남은 근무일에서 오늘 제외
  if (todayDone) {
    remainingDays = Math.max(0, remainingDays - 1);
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

/**
 * 오늘 예상 퇴근 시간 계산
 * @param {number} checkInMinutes - 출근 시간 (분, 예: 593 = 9h53m)
 * @param {number} dailyAverageMinutes - 일평균 필요 근무시간 (분)
 * @returns {{ leaveTimeMinutes: number, canLeaveNow: boolean }}
 */
function calcEstimatedLeaveTime(checkInMinutes, dailyAverageMinutes) {
  const LUNCH_START = 12 * 60; // 720
  const LUNCH_END = 13 * 60; // 780
  const CORE_END = 16 * 60; // 960

  let effectiveStart = checkInMinutes;
  let lunchMinutes = 0;

  // 점심 보정
  if (checkInMinutes <= LUNCH_START) {
    lunchMinutes = 60;
  } else if (checkInMinutes >= LUNCH_END) {
    lunchMinutes = 0;
  } else {
    // 12:00 < 출근 < 13:00 → 13:00 출근 취급
    effectiveStart = LUNCH_END;
    lunchMinutes = 0;
  }

  let leaveTimeMinutes = effectiveStart + dailyAverageMinutes + lunchMinutes;

  // 코어타임 보정: 16:00 미만이면 16:00으로 올림
  if (leaveTimeMinutes < CORE_END) {
    leaveTimeMinutes = CORE_END;
  }

  // 현재 시간과 비교
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const canLeaveNow = nowMinutes >= leaveTimeMinutes;

  return { leaveTimeMinutes, canLeaveNow };
}

// content script와 popup 양쪽에서 사용하기 위해 globalThis에 할당
if (typeof globalThis !== 'undefined') {
  globalThis.Calculator = {
    getWeekdaysInMonth,
    getHolidaysInMonth,
    calcRequiredHours,
    calcRemainingInfo,
    calcEstimatedLeaveTime,
    parseHoursMinutes,
    minutesToHM,
    formatDate,
  };
}
