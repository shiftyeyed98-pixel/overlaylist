# 빠루 CODE!L1 갱신 제어 v3

기준: 요청된 `90e0992bc7aa3a1bfa5e248c2efe79c48d059474` 및 현재 main
`ad1d4e6273bf79e7837d4c14d386bce0641fd0ac`. 두 커밋의 빠루 HTML은 동일하다.
GAS 매핑은 `빠루_메뉴판_L1_수정모드_검증강화_GAS_전체.gs` 원본을 유지했다.
실제 배포된 GAS 내용과 OBS 소스 주소는 접근 권한이 없어 확인하지 못했다.

## 변경

- `control.js`가 모든 네트워크 조회, 캐시 복원, 화면 반영 허가를 담당한다.
- init → 제어기 start → status → data → status → 동기 render만 허용한다.
- TRUE, 제어 필드 누락, 문자열 boolean, 잘못된 스키마, 통신 오류는 갱신 차단이다.
- TRUE + 캐시 없음은 메뉴 영역을 비워 둔다. 기존 고정 제목/제작자 표시는 유지된다.
- 요청은 직렬화되고 15초 요청 제한과 완료 후 3초 제어 재조회가 적용된다.
- 운영 중 DATA 확인 간격은 10초 이상이며, 잠금 해제 감지 시 즉시 DATA를 확인한다.
- v3 게시 표식과 revision이 있는 데이터만 표시하고, 최종 status revision과 다르면 폐기한다.
- cache key는 GAS URL로 구분한다. 기존 v1/v2 캐시를 마이그레이션하지 않는다.
- `index1.html`과 `index2.html`은 쿼리와 해시를 보존해 `index.html`로 이동한다.
  기존 주소를 삭제하지 않지만, 이전 별도 화면 구현을 사용 중이었다면 운영 전 확인이 필요하다.

## GAS 게시본

`Code.gs`는 DATA/CODE를 두 차례 읽어 동일한지 비교하고, 중간과 반환 직전에 L1을 재검사한다.
TRUE에서는 DATA 조회와 게시를 시작하지 않으며 pages 없는 locked 응답만 반환한다.
FALSE에서 검증한 데이터만 숨김 시트 `_PPARU_PUBLISHED_V3`에 게시한다.
응답은 이 게시본을 다시 읽어 SHA-256 무결성을 확인한 결과만 사용한다.
내용이 같으면 다시 쓰지 않으며, ScriptLock으로 웹앱 호출 간 게시본 접근을 직렬화한다.
게시본은 base64로 인코딩해 셀당 40,000자 조각으로 저장하므로 수식으로 해석되지 않는다.
이름이 같은 사용자 시트를 재사용하지 말 것. 형식이 다르면 덮어쓰지 않고 오류로 차단한다.

기존 N1 속도, R1 배율, U1/W1 폭 및 DATA K열 취소선/L열 사용 여부 매핑은 그대로다.
과거 대화의 T1 배율과 달리 **확인한 GAS 원본은 R1**을 사용한다. 이 PR은 셀 위치를 변경하지 않는다.

## 운영 적용 순서

1. 현재 Apps Script 소스와 배포 버전을 백업하고, 실제 배포 코드가 이 원본과 같은지 비교한다.
   다르면 서비스별 추가 로직을 보존해 병합한다. 기존 doGet과 중복 등록하지 않는다.
2. 테스트 시트 사본에서 Code.gs를 교체하고, 편집기에서 일회성 실행 함수가 필요하면
   `function authorizePparu(){ doGet({parameter:{mode:'status'}}); }`를 임시로 추가해 실행/승인한 뒤 삭제한다.
3. 같은 웹앱 배포를 새 버전으로 업데이트한다. URL이 바뀌면 index.html의 GAS_URL도 바꾼다.
   익명 조회가 가능한 기존 접근 권한을 유지한다. 코드가 스프레드시트에 바인딩된 구성을 전제로 한다.
4. L1 FALSE에서 `?mode=data` 응답의 schema=`pparu-l1-v3`, published=true,
   revision 및 pages와 숨김 게시본 생성을 확인한다.
5. L1 TRUE에서 status/data 모두 editMode=true이며 pages가 없는지 확인한다.
6. GAS가 준비된 뒤 HTML과 control.js를 함께 반영한다. 기존 v2 GAS와 새 HTML은 호환되지 않으며
   이 경우 새 화면은 안전하게 비어 있는 상태로 대기한다.
7. OBS의 실제 주소(index/index1/index2), 브라우저 캐시, 로컬 저장소 유지 설정을 확인한다.
   처음 v3로 전환할 때 정상 캐시를 만들려면 L1 FALSE에서 한 번 정상 출력해야 한다.

## 현장 확인

- 정상 출력 → TRUE → DATA/설정 수정 → 여러 조회 주기 대기: 기존 목록 유지.
- FALSE 전환: OBS 재시작 없이 새 목록 한 번 반영.
- TRUE에서 OBS 브라우저 재시작: 정상 v3 캐시만 복원. 캐시 삭제 후 재시작은 빈 메뉴.
- DATA 응답 도중 TRUE 전환: 최종 조회가 TRUE를 확인하면 해당 응답 폐기.
- 인터넷 차단/복구: 차단 중 기존 목록 유지, 복구 후 제어를 확인하고 갱신.
- N1=0에서 미세 스크롤이 없는지, e_colorshift/취소선/고정페이지/배율이 유지되는지 확인.

## 정확한 보장 범위

이 구현은 **조회에서 관측한 TRUE 상태의 DATA를 반영하지 않으며**, 서버는 TRUE 관측 시
작업 중 DATA를 응답하지 않는다. 게시본과 브라우저 캐시도 분리한다.
다만 Google Sheets 수동 편집은 ScriptLock에 참여하지 않는다.
마지막 서버 FALSE 검사와 DOM 반영 사이의 실제 체크 변경, 요청 사이에 끝난 TRUE→FALSE 전환,
읽기 사이에 원상 복구된 변경은 폴링으로 완전히 감지할 수 없다.
따라서 “실제 L1이 TRUE인 모든 순간에 DOM 갱신이 절대 없다”는 보장은 하지 않는다.
그 요구가 필수라면 체크박스 수동 편집 대신 서버가 승인하는 수정 시작/게시 버튼과
브라우저 잠금 확인 응답을 포함하는 프로토콜로 변경해야 한다.

GAS 소스 재배포와 실제 OBS 검증은 PR 작성만으로 실행되지 않는다.
운영 시트에는 아직 쓰지 않았으며, PR은 자동 병합하지 않는다.

## 검증

Node 24:

```sh
node --test P_bbaruuxx/tests/*.test.cjs
```

테스트는 실제 control.js 및 Code.gs를 실행하고, HTTP/저장소/Google 서비스를 모의한다.
실제 GAS 권한/배포, Google Sheets 반영 지연, OBS 렌더링을 검증한 것으로 해석하지 않는다.

참고: https://developers.google.com/apps-script/reference/lock/lock-service
https://developers.google.com/apps-script/reference/spreadsheet/sheet
