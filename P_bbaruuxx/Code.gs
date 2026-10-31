// CODE/DATA 매핑은 기존 검증강화 GAS 원본을 유지한다.
function buildMenuPayload_(ss) {
  const codeSheet = ss.getSheetByName('CODE');
  const dataSheet = ss.getSheetByName('DATA');
  if (!codeSheet || !dataSheet) throw new Error('CODE 또는 DATA 시트가 없습니다.');
  const result = {
    schema: PPARU_SCHEMA,
    editMode: false,
    scrollSeconds: 60,
    scale: 1,
    fixedTopWidthPercent: 85,
    fixedBottomWidthPercent: 85,
    fixedPages: [],
    fixedPagePositions: Object.create(null),
    pageIconEnabled: Object.create(null),
    pageTitleVisible: Object.create(null),
    pages: Object.create(null)
  };
  const titleColors = Object.create(null);
  const text = value => String(value == null ? '' : value).trim();
  const checked = value => value === true || text(value).toUpperCase() === 'TRUE';

  // 숫자와 60s, 60초, 1.2배 같은 입력을 지원한다.
  function numberValue(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    const raw = text(value).replace(/(?:초|s|배|x)$/i, '').trim();
    return raw ? Number(raw) : NaN;
  }

  // 퍼센트 서식 셀은 getValues()가 85%를 0.85로 반환한다.
  // 표시값에서 %를 확인하여 일반 숫자 85와 퍼센트 셀 85%를 모두 지원한다.
  function percentValue(value, display, fallback) {
    const shown = text(display);
    const raw = shown.endsWith('%')
      ? Number(shown.slice(0, -1).replace(/,/g, '').trim())
      : numberValue(value);
    return Number.isFinite(raw) && raw > 0 && raw <= 100 ? raw : fallback;
  }

  if (codeSheet) {
    const range = codeSheet.getRange('C1:Z12');
    const config = range.getValues();
    const display = range.getDisplayValues();
    // C열 기준: N=11, R=15, U=18, W=20
    const speed = numberValue(config[0][11]);
    result.scrollSeconds = text(config[0][11]) === '' || speed === 0
      ? 0 : Number.isFinite(speed) && speed > 0 ? speed : 60;
    const scale = display[0][15].trim().endsWith('%')
      ? Number(display[0][15].trim().slice(0, -1).replace(/,/g, '').trim()) / 100
      : numberValue(config[0][15]);
    result.scale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    result.fixedTopWidthPercent = percentValue(config[0][18], display[0][18], 85);
    result.fixedBottomWidthPercent = percentValue(config[0][20], display[0][20], 85);

    for (let i = 0; i < config[2].length; i++) {
      const key = text(config[2][i]);
      if (!key) continue;
      result.pageIconEnabled[key] = checked(config[1][i]);
      result.pageTitleVisible[key] = checked(config[11][i]);
      if (checked(config[4][i])) {
        if (result.fixedPages.indexOf(key) === -1) result.fixedPages.push(key);
        const position = text(config[10][i]).toLowerCase();
        result.fixedPagePositions[key] = position === 'top' || position === '상단'
          ? 'top' : 'bottom';
      }
      const color = text(config[5][i]);
      if (color) titleColors[key] = color;
    }
  }

  if (!dataSheet) {
    result.error = 'DATA 시트를 찾을 수 없습니다.';
  } else {
    const values = dataSheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const key = text(row[0]);
      const enabled = text(row[11]).toLowerCase();
      if (!key || enabled === '' || enabled === 'false' || enabled === '0') continue;
      const title = text(row[1]);
      const categoryEffect = text(row[2]);
      const categoryIcon = text(row[3]);
      let page = result.pages[key];
      if (!page) {
        page = result.pages[key] = {
          title: title,
          categoryEffect: categoryEffect,
          categoryIcon: categoryIcon,
          titleColor: titleColors[key] || 'blue',
          titleVisible: result.pageTitleVisible[key] === true,
          enabled: true,
          rows: []
        };
      }
      if (!page.title && title) page.title = title;
      if (!page.categoryEffect && categoryEffect) page.categoryEffect = categoryEffect;
      if (!page.categoryIcon && categoryIcon) page.categoryIcon = categoryIcon;
      // DATA K열: 취소선 체크박스, DATA L열: 사용 여부.
      // 프론트 배열: [단가, 시그명, 아이콘, 각주, 강조, 단가색상, 취소선]
      page.rows.push([
        text(row[4]), text(row[5]), text(row[8]), text(row[6]), text(row[7]),
        text(row[9]) || 'blue', checked(row[10])
      ]);
    }
  }
  if (result.error) throw new Error(result.error);
  return result;
}

const PPARU_SCHEMA = 'pparu-l1-v3';
const PPARU_SNAPSHOT = '_PPARU_PUBLISHED_V3';

function jsonOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
function isEditing_(ss) {
  const sheet = ss.getSheetByName('CODE');
  if (!sheet) throw new Error('CODE 시트가 없습니다.');
  const value = sheet.getRange('L1').getValue();
  if (value === true) return true;
  if (value === false) return false;
  // 체크박스 삭제/공백/문자열도 잠금으로 취급한다.
  throw new Error('CODE!L1에 TRUE/FALSE 체크박스가 필요합니다.');
}
function revisionOf_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text,
    Utilities.Charset.UTF_8).map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}
function snapshotHeader_(ss) {
  const sheet = ss.getSheetByName(PPARU_SNAPSHOT);
  if (!sheet) return {sheet: null, revision: null, count: 0};
  const rows = sheet.getRange(1, 1, 3, 1).getValues();
  if (rows[0][0] !== PPARU_SCHEMA) throw new Error('게시본 시트 형식이 잘못되었습니다.');
  const revision = rows[1][0];
  const count = rows[2][0];
  if (typeof revision !== 'string' || !/^[0-9a-f]{64}$/.test(revision) ||
      !Number.isInteger(count) || count < 1 || count > sheet.getMaxRows() - 3) {
    throw new Error('게시본 메타데이터가 손상되었습니다.');
  }
  return {sheet, revision, count};
}
function readPublished_(ss) {
  const header = snapshotHeader_(ss);
  if (!header.sheet) throw new Error('게시본이 없습니다. L1을 해제한 뒤 다시 조회하세요.');
  const chunks = header.sheet.getRange(4, 1, header.count, 1).getValues().map(row => {
    if (typeof row[0] !== 'string' || row[0].slice(0, 4) !== 'b64:') {
      throw new Error('게시본 조각이 손상되었습니다.');
    }
    return row[0].slice(4);
  }).join('');
  const text = Utilities.newBlob(Utilities.base64Decode(chunks)).getDataAsString('UTF-8');
  if (revisionOf_(text) !== header.revision) throw new Error('게시본 무결성 검사 실패');
  return Object.assign(JSON.parse(text), {published: true, revision: header.revision});
}
function publish_(ss, text) {
  const revision = revisionOf_(text);
  const header = snapshotHeader_(ss);
  if (header.revision === revision) return;
  // 셀 길이 및 수식 해석 문제를 피하도록 base64 조각으로 저장한다.
  const encoded = Utilities.base64Encode(text, Utilities.Charset.UTF_8);
  const chunks = encoded.match(/.{1,40000}/g);
  const values = [[PPARU_SCHEMA], [revision], [chunks.length]]
    .concat(chunks.map(chunk => ['b64:' + chunk]));
  const sheet = header.sheet || ss.insertSheet(PPARU_SNAPSHOT);
  if (sheet.getMaxRows() < values.length) {
    sheet.insertRowsAfter(sheet.getMaxRows(), values.length - sheet.getMaxRows());
  }
  sheet.getRange(1, 1, values.length, 1).setValues(values);
  sheet.hideSheet();
  SpreadsheetApp.flush();
}
function doGet(e) {
  const lock = LockService.getScriptLock();
  try {
    const mode = String(e && e.parameter && e.parameter.mode || 'data').toLowerCase();
    if (mode !== 'data' && mode !== 'status') throw new Error('지원하지 않는 mode');
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!lock.tryLock(1000)) throw new Error('게시본 처리 중입니다.');
    const locked = () => ({schema: PPARU_SCHEMA, editMode: true, revision: null, locked: true});
    // TRUE에서는 DATA를 읽지 않는다. 상태 조회도 게시본을 수정하지 않는다.
    if (isEditing_(ss)) return jsonOutput_(locked());
    if (mode === 'status') {
      const revision = snapshotHeader_(ss).revision;
      return jsonOutput_(isEditing_(ss) ? locked() :
        {schema: PPARU_SCHEMA, editMode: false, revision});
    }
    const candidate = JSON.stringify(buildMenuPayload_(ss));
    if (isEditing_(ss)) return jsonOutput_(locked());
    // 조회 도중 값이 변한 경우 불완전한 게시를 보류한다.
    if (candidate !== JSON.stringify(buildMenuPayload_(ss))) {
      throw new Error('DATA/CODE가 변경 중입니다. 게시를 보류합니다.');
    }
    if (isEditing_(ss)) return jsonOutput_(locked());
    publish_(ss, candidate);
    const published = readPublished_(ss);
    return jsonOutput_(isEditing_(ss) ? locked() : published);
  } catch (error) {
    return jsonOutput_({schema: PPARU_SCHEMA, editMode: true, revision: null,
      error: String(error && error.message || error)});
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}
