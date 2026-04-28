/**
 * Popup 메인 로직
 */

const $ = (sel) => document.querySelector(sel);
const Cal = globalThis.Calculator;

let holidays2026 = {};
let state = {
  excludeFriday: true,
  customHolidays: [],
};

// --- 초기화 ---

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 공휴일 데이터 로드
    const resp = await fetch(chrome.runtime.getURL('data/holidays-2026.json'));
    holidays2026 = await resp.json();
  } catch {
    holidays2026 = {};
  }

  // 저장된 설정 로드
  const stored = await chrome.storage.local.get(['excludeFriday', 'customHolidays']);
  state.excludeFriday = stored.excludeFriday ?? true;
  state.customHolidays = stored.customHolidays ?? [];

  $('#exclude-friday').checked = state.excludeFriday;

  // 이벤트 바인딩
  $('#exclude-friday').addEventListener('change', onToggleFriday);
  $('#settings-toggle').addEventListener('click', onToggleSettings);
  $('#add-holiday-btn').addEventListener('click', onAddHoliday);

  // 데이터 가져오기
  await fetchAndRender();
});

// --- 데이터 가져오기 ---

async function fetchAndRender() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      showError();
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_WORK_DATA' });

    if (!response?.success) {
      showError();
      return;
    }

    render(response);
  } catch {
    showError();
  }
}

// --- 렌더링 ---

function render(data) {
  const { accumulated, remainingDays: pageRemainingDays, year, month, checkInTime, checkOutTime } = data;

  const accMinutes = Cal.parseHoursMinutes(accumulated);
  if (accMinutes === null) {
    showError();
    return;
  }

  // 공휴일 병합 (번들 + 수동)
  const mergedHolidays = getMergedHolidays();

  const weekdays = Cal.getWeekdaysInMonth(year, month);
  const monthHolidays = Cal.getHolidaysInMonth(mergedHolidays, year, month);
  const requiredHours = Cal.calcRequiredHours(weekdays, monthHolidays);

  const today = Cal.formatDate(new Date());

  // 출근 후 네이버 웍스가 남은 일수를 1 줄이므로, 출근 상태면 +1 보정
  const adjustedRemainingDays =
    pageRemainingDays != null && checkInTime
      ? pageRemainingDays + 1
      : pageRemainingDays ?? null;

  const info = Cal.calcRemainingInfo({
    accumulatedMinutes: accMinutes,
    requiredHours,
    pageRemainingDays: adjustedRemainingDays,
    today,
    weekdays,
    holidays: monthHolidays,
    excludeFriday: state.excludeFriday,
    todayDone: !!checkOutTime,
  });

  // UI 업데이트
  $('#month-title').textContent = `${year}년 ${month}월`;

  $('#required-hours').textContent = `${requiredHours}h`;

  const accHM = Cal.minutesToHM(accMinutes);
  $('#accumulated-hours').textContent = `${accHM.hours}h ${accHM.minutes}m`;

  const remHM = Cal.minutesToHM(info.remainingMinutes);
  $('#remaining-hours').textContent = `${remHM.hours}h ${remHM.minutes}m`;

  $('#remaining-days').textContent = `${info.remainingDays}일`;

  const avgHM = Cal.minutesToHM(info.dailyAverageMinutes);
  $('#daily-average').textContent = `${avgHM.hours}h ${avgHM.minutes}m`;

  // 퇴근 시간 렌더링
  renderLeaveTime(checkInTime, info.dailyAverageMinutes, info.remainingDays, checkOutTime);

  // 상태 전환
  $('#loading').classList.add('hidden');
  $('#error').classList.add('hidden');
  $('#main').classList.remove('hidden');

  // 수동 공휴일 목록 렌더
  renderCustomHolidays();

  // 재계산용 데이터 저장
  state._lastData = data;
}

function showError() {
  $('#loading').classList.add('hidden');
  $('#main').classList.add('hidden');
  $('#error').classList.remove('hidden');
}

// --- 이벤트 핸들러 ---

function onToggleFriday(e) {
  state.excludeFriday = e.target.checked;
  chrome.storage.local.set({ excludeFriday: state.excludeFriday });

  if (state._lastData) render(state._lastData);
}

function onToggleSettings() {
  $('#settings').classList.toggle('hidden');
}

function onAddHoliday() {
  const input = $('#holiday-input');
  const dateStr = input.value;
  if (!dateStr) return;

  if (state.customHolidays.includes(dateStr)) return;

  state.customHolidays.push(dateStr);
  state.customHolidays.sort();
  chrome.storage.local.set({ customHolidays: state.customHolidays });

  input.value = '';
  if (state._lastData) render(state._lastData);
}

function onDeleteHoliday(dateStr) {
  state.customHolidays = state.customHolidays.filter((d) => d !== dateStr);
  chrome.storage.local.set({ customHolidays: state.customHolidays });
  if (state._lastData) render(state._lastData);
}

// --- 퇴근 시간 ---

function renderLeaveTime(checkInTime, dailyAverageMinutes, remainingDays, checkOutTime) {
  const card = $('#leave-time-card');
  const label = $('#leave-time-label');
  const value = $('#leave-time-value');

  // 초기화
  card.classList.remove('can-leave', 'no-checkin', 'hidden');

  // 퇴근 완료 → 퇴근 시간 표시
  if (checkOutTime) {
    card.classList.add('can-leave');
    label.textContent = '퇴근 완료';
    value.textContent = checkOutTime;
    return;
  }

  // 남은 근무일 0일 → 숨김
  if (remainingDays <= 0) {
    card.classList.add('hidden');
    return;
  }

  if (!checkInTime) {
    card.classList.add('no-checkin');
    label.textContent = '';
    value.textContent = '출근 기록이 없습니다';
    return;
  }

  const checkInMinutes = Cal.parseHoursMinutes(checkInTime);
  if (checkInMinutes === null) {
    card.classList.add('no-checkin');
    label.textContent = '';
    value.textContent = '출근 기록이 없습니다';
    return;
  }

  const result = Cal.calcEstimatedLeaveTime(checkInMinutes, dailyAverageMinutes);
  const hm = Cal.minutesToHM(result.leaveTimeMinutes);
  const timeStr = `${String(hm.hours).padStart(2, '0')}:${String(hm.minutes).padStart(2, '0')}`;

  if (result.canLeaveNow) {
    card.classList.add('can-leave');
    label.textContent = '';
    value.textContent = '지금 퇴근 가능!';
  } else {
    label.textContent = '오늘 퇴근 가능';
    value.textContent = timeStr;
  }
}

// --- 헬퍼 ---

function getMergedHolidays() {
  const merged = { ...holidays2026 };
  for (const d of state.customHolidays) {
    if (!merged[d]) {
      merged[d] = ['수동 추가'];
    }
  }
  return merged;
}

function renderCustomHolidays() {
  const list = $('#custom-holidays-list');
  list.replaceChildren();

  for (const dateStr of state.customHolidays) {
    const li = document.createElement('li');

    const span = document.createElement('span');
    span.textContent = dateStr;

    const btn = document.createElement('button');
    btn.className = 'delete-btn';
    btn.textContent = '삭제';
    btn.addEventListener('click', () => onDeleteHoliday(dateStr));

    li.appendChild(span);
    li.appendChild(btn);
    list.appendChild(li);
  }
}
