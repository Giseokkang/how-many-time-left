/**
 * Content Script — 네이버 웍스 홈/근무통계 페이지에서 데이터 추출
 * 대상: home.worksmobile.com, workplace.worksmobile.com
 *
 * 홈 화면 "나의 근로 시간" 위젯 구조:
 *   - "일평균 잔여 시간" 라벨 인접에 "17:36 / 5일" (남은 일수)
 *   - "산정 기간 내 누적 시간" 라벨 인접에 "114:09 / 218:24" (누적 시간)
 *   - "2026.03.24 화" 형태의 날짜 텍스트
 */

(() => {
  /**
   * 특정 라벨 텍스트를 포함하는 요소의 인접 영역에서 패턴 추출
   * @param {string} label - 찾을 라벨 텍스트
   * @param {RegExp} pattern - 추출할 정규식 (g 플래그 사용)
   * @param {number} [matchIndex=0] - 여러 매치 중 사용할 인덱스
   * @returns {string|null}
   */
  function scrapeNearLabel(label, pattern, matchIndex = 0) {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null
    );

    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.includes(label)) {
        let container = node.parentElement;
        for (let i = 0; i < 5 && container; i++) {
          const matches = container.textContent.match(pattern);
          if (matches && matches.length > matchIndex) {
            return matches[matchIndex];
          }
          container = container.parentElement;
        }
      }
    }
    return null;
  }

  /** 누적 근무시간 "HH:MM" 추출 */
  function scrapeAccumulatedTime() {
    // "산정 기간 내 누적 시간" 라벨 근처에서 첫 번째 HH:MM
    const result = scrapeNearLabel('산정 기간 내 누적 시간', /(\d{1,4}):(\d{2})/g, 0);
    if (result) return result;

    // 폴백: 볼드/강조 요소에서 HH:MM 패턴
    const selectors = 'strong, b, [class*="time"], [class*="hour"], [class*="bold"], [class*="num"]';
    for (const el of document.querySelectorAll(selectors)) {
      const match = el.textContent.trim().match(/^(\d{1,4}):(\d{2})$/);
      if (match) return match[0];
    }
    return null;
  }

  /** 남은 근무일 수 추출 — "일평균 잔여 시간" 영역에서 "N일" 패턴 */
  function scrapeRemainingDays() {
    const result = scrapeNearLabel('일평균 잔여 시간', /(\d{1,2})일/g, 0);
    if (result) {
      const match = result.match(/(\d{1,2})/);
      return match ? parseInt(match[1], 10) : null;
    }
    return null;
  }

  /** 출근 시간 "HH:MM" 추출 — "출퇴근" 위젯에서 "출근 HH:MM" 패턴 */
  function scrapeCheckInTime() {
    const result = scrapeNearLabel('출근', /(\d{1,2}):(\d{2})/g, 0);
    return result; // "09:53" 또는 null
  }

  /** 퇴근 시간 "HH:MM" 추출 — "퇴근 HH:MM" 패턴 (시계 타이머 18:18:55 제외) */
  function scrapeCheckOutTime() {
    const match = document.body.textContent.match(/퇴근\s*(\d{1,2}:\d{2})(?!:\d)/);
    return match ? match[1] : null;
  }

  /** 현재 연월 — 브라우저 시각 기준 */
  function scrapeYearMonth() {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }

  // popup에서 메시지를 보내면 응답
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'SCRAPE_WORK_DATA') {
      const accumulated = scrapeAccumulatedTime();
      const remainingDays = scrapeRemainingDays();
      const yearMonth = scrapeYearMonth();

      sendResponse({
        success: accumulated !== null,
        accumulated,
        remainingDays,
        checkInTime: scrapeCheckInTime(),
        checkOutTime: scrapeCheckOutTime(),
        year: yearMonth.year,
        month: yearMonth.month,
      });
    }
    return true;
  });
})();
