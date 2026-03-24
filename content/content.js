/**
 * Content Script — 네이버 웍스 홈/근무통계 페이지에서 데이터 추출
 * 대상: home.worksmobile.com, workplace.worksmobile.com
 *
 * 홈 화면 "나의 근로 시간" 위젯 구조:
 *   - "산정 기간 내 누적 시간" 라벨 인접에 "114:09" 형태의 누적 시간
 *   - "2026.03.23 월" 형태의 날짜 텍스트
 */

(() => {
  /** 페이지 텍스트에서 누적 근무시간 "HH:MM" 패턴 추출 */
  function scrapeAccumulatedTime() {
    // 전략 1: "산정 기간 내 누적 시간" 라벨 기반 탐색
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null
    );

    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.includes('산정 기간 내 누적 시간')) {
        // 라벨을 포함하는 위젯/섹션 영역에서 HH:MM 패턴 찾기
        let container = node.parentElement;
        // 상위로 올라가며 충분한 영역을 찾는다 (최대 5단계)
        for (let i = 0; i < 5 && container; i++) {
          const text = container.textContent;
          // 누적 시간 패턴: "114:09" (1~4자리:2자리)
          const matches = text.match(/(\d{1,4}):(\d{2})/g);
          if (matches && matches.length > 0) {
            // 첫 번째 매치가 누적 시간 (보통 "누적시간 / 총필요시간" 순서)
            return matches[0];
          }
          container = container.parentElement;
        }
      }
    }

    // 전략 2: 볼드/강조 요소에서 HH:MM 패턴 찾기
    const selectors = 'strong, b, [class*="time"], [class*="hour"], [class*="bold"], [class*="num"]';
    for (const el of document.querySelectorAll(selectors)) {
      const match = el.textContent.trim().match(/^(\d{1,4}):(\d{2})$/);
      if (match) return match[0];
    }

    return null;
  }

  /** 페이지에서 현재 조회 연월 추출 */
  function scrapeYearMonth() {
    const body = document.body.textContent;

    // "2026.03.23" 패턴
    let match = body.match(/(\d{4})\.(\d{1,2})\.\d{1,2}/);
    if (match) {
      return { year: parseInt(match[1], 10), month: parseInt(match[2], 10) };
    }

    // "2026년 3월" 패턴
    match = body.match(/(\d{4})년\s*(\d{1,2})월/);
    if (match) {
      return { year: parseInt(match[1], 10), month: parseInt(match[2], 10) };
    }

    // 폴백: 현재 날짜 기준
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }

  // popup에서 메시지를 보내면 응답
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'SCRAPE_WORK_DATA') {
      const accumulated = scrapeAccumulatedTime();
      const yearMonth = scrapeYearMonth();

      sendResponse({
        success: accumulated !== null,
        accumulated,
        year: yearMonth.year,
        month: yearMonth.month,
      });
    }
    return true; // 비동기 응답을 위해
  });
})();
