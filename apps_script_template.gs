// Google Apps Script Template for OBS Overlay Data API

// 설정
const SPREADSHEET_ID = '12iNKfEVP6EyseR9s0DYIjIBjEZb2XPGxoElmzOaG7ZI'; // 구글시트 ID 입력
const SHEET_NAMES = {
  streamers: 'streamers',
  streamer_accounts: 'streamer_accounts',
  pages: 'pages',
  items: 'items',
  codes: 'codes'
};

// ====================
// 1. 데이터 조회 함수
// ====================

function getSheetData(sheetName) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(`Sheet not found: ${sheetName}`);
  }
  const data = sheet.getDataRange().getValues();
  return data;
}

function convertToObject(headers, row) {
  const obj = {};
  headers.forEach((header, index) => {
    obj[header] = row[index] || '';
  });
  return obj;
}

// ====================
// 2. 스트리머 정보 조회
// ====================

function getStreamerInfo(streamerNo) {
  const data = getSheetData(SHEET_NAMES.streamers);
  const headers = data[0];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[1] === streamerNo) { // streamerNo는 2번째 컬럼 (index 1)
      return convertToObject(headers, row);
    }
  }
  return null;
}

// ====================
// 3. 페이지 정보 조회
// ====================

function getPagesByStreamer(streamerNo) {
  const data = getSheetData(SHEET_NAMES.pages);
  const headers = data[0];
  const pages = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[0] === streamerNo && row[7] === 'Y') { // streamerNo와 isVisible=Y 확인
      pages.push(convertToObject(headers, row));
    }
  }
  return pages;
}

// ====================
// 4. 각 페이지의 항목 조회
// ====================

function getItemsByPage(pageNo) {
  const data = getSheetData(SHEET_NAMES.items);
  const headers = data[0];
  const items = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[0] === pageNo && row[7] === 'Y') { // pageNo와 isActive=Y 확인
      items.push(convertToObject(headers, row));
    }
  }
  
  // itemOrder로 정렬
  items.sort((a, b) => {
    const orderA = parseFloat(a.itemOrder) || 0;
    const orderB = parseFloat(b.itemOrder) || 0;
    return orderA - orderB;
  });
  
  return items;
}

// ====================
// 5. 최종 응답 데이터 구성
// ====================

function buildOverlayResponse(streamerNo) {
  try {
    const streamer = getStreamerInfo(streamerNo);
    if (!streamer) {
      return { error: `Streamer not found: ${streamerNo}` };
    }
    
    const pages = getPagesByStreamer(streamerNo);
    
    // 각 페이지에 items 추가
    const pagesWithItems = pages.map(page => {
      const items = getItemsByPage(page.pageNo);
      
      // index.html 템플릿 형식으로 변환
      return {
        title: page.pageTitle || '',
        titleClass: page.titleClass || 'title-pink',
        variant: page.theme || 'pink', // 아니면 streamer.theme 사용
        pageClass: page.pageKey || '',
        rows: items.map(item => [
          item.num || '',
          item.label || '',
          item.note || '',
          item.iconType || ''
        ])
      };
    });
    
    // pageOrder로 정렬
    pagesWithItems.sort((a, b) => {
      const pages_data = getPagesByStreamer(streamerNo);
      const pageA = pages_data.find(p => p.pageKey === a.pageClass);
      const pageB = pages_data.find(p => p.pageKey === b.pageClass);
      const orderA = parseFloat(pageA?.pageOrder || 0);
      const orderB = parseFloat(pageB?.pageOrder || 0);
      return orderA - orderB;
    });
    
    return {
      status: 'success',
      streamer: {
        streamerId: streamer.streamerId,
        streamerNo: streamer.streamerNo,
        displayName: streamer.displayName,
        theme: streamer.theme,
        titleIconUrl: streamer.titleIconUrl
      },
      pages: pagesWithItems
    };
    
  } catch (error) {
    return { error: error.toString() };
  }
}

// ====================
// 6. Web App Handler (GET 구현)
// ====================

function doGet(e) {
  const streamerNo = e.parameter.streamerNo || '';
  
  if (!streamerNo) {
    return ContentService.createTextOutput(JSON.stringify({
      error: 'streamerNo parameter required'
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  const response = buildOverlayResponse(streamerNo);
  
  const output = ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
  
  // CORS 헤더 추가
  output.setHeaders({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  
  return output;
}

// ====================
// 7. 테스트 함수 (배포 후 테스트용)
// ====================

function test() {
  const result = buildOverlayResponse('STR00001');
  Logger.log(JSON.stringify(result, null, 2));
}
