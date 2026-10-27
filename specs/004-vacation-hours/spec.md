# spec: 휴가 시간 단위 (반반차 / 반차 / 연차)

## 메타
- id: 004
- 작성일: 2026-10-27
- 상태: draft
- 관련 기획: 003-vacation-adjustment 확장 (하루 단위 → 2h / 4h / 8h)

---

## 목적

회사 휴가는 **2h(반반차) / 4h(반차) / 8h(연차)** 단위로 쓸 수 있는데, 003은 하루(8h) 단위만 지원한다.
반반차·반차를 쓰는 날도 근무일이지만 실제로 일하는 시간은 그만큼 짧다.
이 내용이 계산에 반영되지 않아서 두 가지 문제가 생긴다.

1. 반반차·반차 날짜를 휴가로 넣으면 그날이 근무일에서 통째로 빠져 일평균이 부풀려진다.
2. 넣지 않으면 그날 퇴근 가능 시간이 휴가 시간만큼 늦게 표시된다.

---

## 입력 / 출력

### 입력
| 필드 | 타입 | 소스 | 확인 | 규칙 |
|------|------|------|:----:|------|
| 휴가 목록 | `{ date: "YYYY-MM-DD", hours: 2\|4\|8 }[]` | 사용자 입력 (팝업 설정: date + 시간 select) | [x] | `chrome.storage.local.vacations`. 날짜 정렬, 같은 날짜는 덮어쓰기 |
| 기존 저장값 | `string[]` | 003 저장 포맷 | [x] | 로드 시 `{ date, hours: 8 }` 로 변환 (마이그레이션) |
| 누적 근무시간 | "HH:MM" | 네이버 웍스 홈 | [x] | 휴가 크레딧이 이미 포함됨 (2026-10-22 반반차 2h → 근로시간 현황 08:29 = 실근무 6:29 + 2:00 로 확인) |

### 출력
- **8h 휴가**: 003 동작 그대로 (남은 근무일에서 제외)
- **2h / 4h 휴가** (오늘 이후): 근무일은 유지한다. 날마다 "실근무 + 휴가" 크레딧이 같아지도록 배분한다.
  - `T = (required − accumulated − fridayMinutes + partialMinutes) / remainingDays`
  - 일평균 필요 근무시간 = `T` (휴가 포함 크레딧 기준이므로 네이버 웍스 일평균과 같은 의미)
  - 해당 날짜의 실근무 = `T − 휴가시간`
  - **오늘이 부분 휴가일이면** 퇴근 가능 시간 = 출근 + (`T − 휴가시간`) + 점심
- 설정 목록 표시: `2026-10-22 · 2h  [삭제]`

---

## 계산 로직

`calcRemainingInfo` 의 `vacationDates: string[]` → `vacations: {date, hours}[]` 로 바꾼다.

```
fullDates   = vacations.filter(h === 8).map(date)   → 기존 vacationSet 로직 그대로
partials    = vacations.filter(h < 8 && date >= today && 근무일)
              (todayDone 이면 date > today)
금요일 제외 ON 이고 partial 이 금요일 → fridayMinutes 에서 휴가시간 차감 (금요일 8h 고정 총량 유지)
partialMinutes = 나머지 partial 의 휴가시간 합

remainingMinutes   = required − acc − fridayMinutes          (실제로 더 일해야 할 시간, 표시용)
dailyAverage (T)   = (remainingMinutes + partialMinutes) / remainingDays
todayVacationMinutes = 오늘 partial 휴가시간 (없으면 0)
```

퇴근 시간: `calcEstimatedLeaveTime(checkIn, T − todayVacationMinutes)`

### 예시 (10/26 기준 스샷 값, 10/28(수) 반차 4h 가정)
- required 160h, acc 118:14 (반차 크레딧 4h 포함), 금 1일 → remaining = 33:46
- partialMinutes = 4h, remainingDays = 4
- T = (33:46 + 4:00) / 4 = **9h 26m** → 10/28 실근무 5h 26m, 나머지 날 9h 26m
- 검산: 9:26×3 + 5:26 = 33:44 (반올림 차이)

---

## 엣지케이스

- [ ] 003 포맷(`string[]`) 저장값 → 로드 시 8h 로 변환 (다음 추가·삭제 때 새 포맷으로 저장)
- [ ] 같은 날짜 재추가 → 시간만 덮어씀
- [ ] 과거 날짜 부분 휴가 → 누적에 이미 반영되어 계산 영향 없음 (목록에만 표시)
- [ ] 오늘 퇴근 완료(todayDone) + 오늘 부분 휴가 → 오늘 날짜를 partial 에서 제외
- [ ] 부분 휴가일이 공휴일·주말 → 근무일이 아니므로 무시
- [ ] 금요일 제외 ON + 금요일 반차 → 금요일 고정분 8h − 4h = 4h 만 차감
- [ ] 네트워크 오류 / 빈 상태 → 기존 동작 유지 (휴가 0건이면 003 이전과 같은 결과)

---

## UI 변경

```
이 달 휴가
[ YYYY-MM-DD ▼ ] [ 8h ▼ ] [추가]      ← select: 2h(반반차) / 4h(반차) / 8h(연차), 기본 8h
• 2026-10-22 · 2h   [삭제]
• 2026-10-30 · 8h   [삭제]
```

- 스타일: 기존 `.add-holiday-row`, `.holidays-list` 재사용

---

## 제약사항
- 사용할 라이브러리/컴포넌트: 기존 파일만 수정 (calculator.js, popup.js, popup.html, 필요 시 popup.css)
- Out of Scope:
  - 2/4/8 외의 임의 시간 단위
  - 네이버 웍스 부재 일정 자동 연동 (my-absence 스크래핑)
  - 반차 시간대(오전/오후)에 따른 출근 시각·점심 보정

---

## 기술적 리스크

- [x] 저장 포맷 변경 → 로드 시 마이그레이션으로 하위 호환
- [x] 네이버 웍스는 **미래** 부분 휴가 크레딧을 누적에 즉시 넣음 (2026-10-27 확인: 10/29 반반차 등록 → 10/29 행 02:00, 누적 118:14 + 8:38(10/26) + 2:00 = 128:52)

---

## 구현 태스크
- [x] T001 calculator.js: `calcRemainingInfo` 가 `vacations` 를 받도록 변경, partial / full 분기, `todayVacationMinutes` 반환
- [x] T002 popup.html: 휴가 추가 행에 시간 select 추가
- [x] T003 popup.js: 저장 포맷 마이그레이션, 추가/삭제/렌더 수정, 퇴근 시간에 오늘 휴가 반영
- [x] T004 calculator 자가 검증 스크립트 (`node test/calculator.check.js`): 위 예시 값 확인
- [ ] T005 수동 테스트: 실제 팝업에서 반차 추가·삭제 시 재계산 확인

---

## 확인 필요
- [x] 미래 부분 휴가 크레딧이 누적에 즉시 반영됨 → 확인 완료 (기술적 리스크 참고)
- [ ] 분배 방식 = "날마다 크레딧(실근무 + 휴가)을 같게" (기본값). 대안: 휴가와 무관하게 실근무를 날마다 같게
