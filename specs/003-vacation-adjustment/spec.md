# spec: 휴가 날짜 반영

## 메타
- id: 003
- 작성일: 2026-07-22
- 상태: draft
- 관련 기획: 001-work-hours-calculator 확장 (휴가일 남은 근무 계산 보정)

---

## 목적

네이버 웍스는 등록된 휴가일을 **누적 근무시간에 +8h 자동 크레딧** 을 부여한다 (미래 휴가도 즉시 반영). 반면 `남은 근무일` 카운트에서 휴가일이 제외되는지는 신뢰할 수 없어, 실질적으로 아래 두 가지 왜곡이 발생한다:

1. **금요일 재택 제외 옵션과 충돌**: 휴가일이 금요일이면 "금요일 재택 8h 크레딧" 이 중복 적용돼 남은 시간이 8h 과잉 차감됨
2. **남은 근무일 과잉 카운트**: 페이지가 휴가일을 여전히 근무일로 카운트하면, 일평균 분모가 부풀려짐 (일평균이 실제보다 낮게 표시)

사용자가 이 달에 등록한 휴가 **날짜** 를 직접 입력해서 두 문제를 동시에 보정한다.

---

## 입력 / 출력

### 입력
| 필드 | 타입 | 소스 | 확인 | 규칙 |
|------|------|------|:----:|------|
| 휴가 날짜 목록 | string[] ("YYYY-MM-DD") | 사용자 직접 입력 (팝업 설정, `<input type="date">`) | [x] | chrome.storage 에 배열로 저장. 정렬 유지, 중복 방지 |

### 출력
- 휴가일이 `calcWorkdays` 에서 제외 → 금요일 카운트에서 자동 제외
- 페이지의 `남은 근무일` 값에서 미래 휴가 일수만큼 차감
- 결과: 남은 시간 / 남은 일수 / 일평균이 실제와 일치

---

## 계산 로직

`Cal.calcRemainingInfo` 에 `vacationDates: string[]` 파라미터 추가:

```
holidaySet ∪ vacationSet 로 calcWorkdays 필터 강화
  → 금요일 카운트에서 휴가일 자동 제외

futureVacationCount = vacationDates.filter(d >= today).length
totalRemainingDays = pageRemainingDays != null
  ? max(0, pageRemainingDays - futureVacationCount)
  : calcWorkdays.length
```

**required 는 건드리지 않는다** — 페이지 정책상 휴가일이 워크데이로 카운트되고, 페이지 누적에도 +8h 크레딧이 이미 반영되어 있으므로 자연 상쇄.

### 예시 (2026-07, 오늘 7/22, 7/31 휴가)

| 지표 | 페이지 | 계산 (금요일 제외 ON) |
|------|--------|--------------------|
| required | — | 184h (calendar) |
| accumulated | 116h 52m (7/31 8h 포함) | 그대로 사용 |
| 미래 휴가 | — | 1일 (7/31) |
| pageRemainingDays | 8 | 8 - 1 = 7 |
| calcWorkdays (7/31 제외) | — | 7일 (7/22~30 평일) |
| fridayCount | — | 1 (7/24 만, 7/31 은 휴가로 제외) |
| remaining_hours | — | 184 - 116.87 - 8 = 59.13h |
| remaining_days | — | 7 - 1 = 6 |
| 일평균 | — | **9h 51m/day** |

### 예시 (7/29 수요일 휴가 케이스)

- fridayCount = 2 (7/24, 7/31 그대로) → friday_hours = 16h
- pageRemainingDays 8 - 1 = 7
- remaining_days = 7 - 2 = 5
- remaining_hours = 184 - 116.87 - 16 = 51.13h
- 일평균 = 51.13 / 5 = **10h 14m/day**

---

## 엣지케이스

- [x] 휴가일이 금요일 → 자동으로 fridayCount 에서 제외
- [x] 휴가일이 평일 (금요일 아님) → fridayCount 영향 없음, 남은 일수만 -1
- [x] 오늘 이전 휴가일 → 누적에는 이미 반영됨, `futureVacationCount` 에서 제외되어 남은 일수 무영향 (calcWorkdays 필터는 today 이후만 대상이라 자연 처리)
- [x] 휴가일이 다른 달 → 월 필터로 무시 (`monthVacations` 만 넘김)
- [x] 페이지 남은 일수 < 휴가 수 → `Math.max(0, ...)` 로 음수 방지
- [ ] 같은 날짜 중복 추가 → 기존 수동 공휴일 로직처럼 `.includes()` 로 차단
- [ ] 휴가일이 공휴일과 겹침 → 자연스럽게 vacationSet ∪ holidaySet 이므로 이중 제외 없음

---

## UI 변경

### 팝업 설정 영역

기존 "수동 공휴일 관리" **위에** 동일 패턴의 "이 달 휴가" 섹션 추가:

```
설정
├─ 이 달 휴가
│   [ YYYY-MM-DD ▼ ] [추가]
│   • 2026-07-31   [삭제]
│
└─ 수동 공휴일 관리 (기존)
    [ YYYY-MM-DD ▼ ] [추가]
    ...
```

- 저장: `chrome.storage.local.vacations = ["YYYY-MM-DD", ...]`
- 스타일: 기존 `.add-holiday-row`, `.holidays-list` 재사용

---

## 제약사항
- 사용할 라이브러리/컴포넌트: 기존 코드만 확장 (새 파일 없음)
- Out of Scope:
  - 반차/시간 단위 휴가 (하루 단위만)
  - 다월 저장 (모든 달의 휴가를 배열에 함께 저장, 월별 필터링으로 처리)
  - 네이버 웍스 페이지에서 휴가 자동 감지

---

## 기술적 리스크

- [x] `calcRemainingInfo` 시그니처 변경 — `vacationDates` 옵션 파라미터로 하위 호환 유지
- [x] chrome.storage 키 `vacations` — 기존 `customHolidays`, `excludeFriday` 와 충돌 없음
- [x] 페이지의 `일평균 잔여 시간 N일` 이 휴가일을 포함하는지 확실치 않음 — 이미지로 검증 결과 **포함** 하는 것으로 판단 (6일 = 8 - 2 fridays)

---

## 구현 태스크
- [x] T001 calculator.js — `calcRemainingInfo` 에 `vacationDates` 파라미터 추가, `calcWorkdays` 필터와 `pageRemainingDays` 조정
- [x] T002 popup.html — 설정 영역에 휴가 날짜 리스트 UI 추가, 의무 근로시간 서브라벨 제거
- [x] T003 popup.css — 이전 v1.2.0 의 `.vacation-row`, `.stat-sublabel` 제거 (재사용 스타일만 유지)
- [x] T004 popup.js — `state.vacations` 관리, 로드/저장, 추가/삭제 핸들러, 월 필터링 후 `calcRemainingInfo` 에 전달
- [ ] T005 수동 테스트 — 7/31 추가 시 일평균 ≈ 9h 51m, 다른 요일 (예: 7/29) 추가 시 예상대로 재계산되는지 확인

---

## 확인 필요
- [x] 입력 단위 = 날짜 리스트 → **확정**
- [x] required 는 건드리지 않음 (페이지 누적 크레딧과 상쇄) → **확정**
- [x] 페이지 남은 일수가 휴가 포함 여부 → 이미지 근거로 **포함** → 코드에서 차감
