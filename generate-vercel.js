const fs = require('fs');
const path = require('path');

const overlayRoot = '.';

function generateSlug(length = 12) {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  let result = '';

  for (let i = 0; i < length; i++) {
    result += chars.charAt(
      Math.floor(Math.random() * chars.length)
    );
  }

  return result;
}

function parseFolderInfo(folder) {
  const [prefix, ...rest] = folder.split('_');

  const streamer = rest.join('_');

  const platformMap = {
    F: 'FlexTV',
    S: 'SoopLive',
    P: 'PandaTV',
    T: 'Twitch'
  };

  return {
    platform: platformMap[prefix] || 'Unknown',
    streamer
  };
}

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

const folders = fs.readdirSync(overlayRoot).filter(folder => {
  const fullPath = path.join(overlayRoot, folder);
  if (!fs.statSync(fullPath).isDirectory()) {
    return false;
  }
  
  return /^[FPST]_/.test(folder);
});

let overlays = [];

if (fs.existsSync('./overlays.json')) {
  overlays = JSON.parse(
    fs.readFileSync('./overlays.json', 'utf8')
  );
}

folders.forEach(folder => {
  const overlayPath = `folder`;

  const exists = overlays.find(
    item => item.path === overlayPath
  );

  if (!exists) {
    const info = parseFolderInfo(folder);

    overlays.push({
      platform: info.platform,
      streamer: info.streamer,

      slug: generateSlug(),

      path: overlayPath,

      note: '',

      createdAt: getTodayDate(),

      active: true,

      type: 'reaction-list'
    });
  }
});

const activeOverlays = overlays.filter(
  item => item.active === true
);

const rewrites = activeOverlays.map(item => ({
  source: `/o/${item.slug}`,
  destination: `/${item.path}`
}));

const redirects = [
  {
    source: '/overlaylist/:path*',
    destination: '/404',
    permanent: false
  }
];

const vercelConfig = {
  rewrites,
  redirects
};

fs.writeFileSync(
  './overlays.json',
  JSON.stringify(overlays, null, 2),
  'utf8'
);

fs.writeFileSync(
  './vercel.json',
  JSON.stringify(vercelConfig, null, 2),
  'utf8'
);

console.log('vercel.json 생성 완료');
console.log('overlays.json 업데이트 완료');
