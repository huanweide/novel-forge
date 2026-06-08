// Novel Forge APK 构建脚本
// 用 @bubblewrap/core 生成 TWA (Trusted Web Activity) APK
const { TwaGenerator, TwaManifest, KeyTool, JdkHelper, Config, ConsoleLog, fetchUtils } = require('@bubblewrap/core');
const path = require('path');
const fs = require('fs');
const http = require('http');

// 切换 fetch 引擎到 node-fetch（HTTP/1.1），因为 sandbox 不支持外部网络
fetchUtils.setFetchEngine('node-fetch');

// === 配置 ===
const JDK_PATH = 'C:/Users/Administrator/.bubblewrap/jdk/jdk-17.0.11+9';
const BUILD_DIR = path.join(__dirname, '..', 'apk_build');
const OUT_DIR = path.join(__dirname, '..', 'public', 'download');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const PWA_URL = 'https://novel-forge-nu.vercel.app';

// 用本地服务器提供图标文件（避免网络限制）
function startLocalServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
      try {
        const data = fs.readFileSync(filePath);
        const ext = path.extname(filePath);
        const mime = { '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.js': 'application/javascript' }[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

const KEYSTORE_CONFIG = {
  path: path.join(BUILD_DIR, 'novel-forge.keystore'),
  password: 'novelforge123',
  alias: 'novelforge',
  fullName: 'Novel Forge',
  organizationalUnit: 'Dev',
  organization: 'novelforge',
  country: 'CN',
};

async function main() {
  const log = new ConsoleLog('build-apk');

  console.log('🔧 Novel Forge APK 构建器 — TWA 打包');
  console.log(`   线上目标: ${PWA_URL}`);

  // 1. 设置 JDK 环境
  process.env.JAVA_HOME = JDK_PATH;
  process.env.PATH = path.join(JDK_PATH, 'bin') + ';' + process.env.PATH;
  console.log('✅ JDK ' + JDK_PATH);

  // 2. 启动本地 HTTP 服务器（提供图标文件给 bubblewrap 下载）
  const { server, url: LOCAL_URL } = await startLocalServer();
  console.log(`🌐 本地服务器: ${LOCAL_URL}`);

  try {
    // 2+. 清理并创建目录
    fs.rmSync(BUILD_DIR, { recursive: true, force: true });
    fs.mkdirSync(BUILD_DIR, { recursive: true });
    fs.mkdirSync(OUT_DIR, { recursive: true });

    // 3. 生成签名密钥库
    const config = new Config(JDK_PATH);
    const jdkHelper = new JdkHelper(process, config);
    const keytool = new KeyTool(jdkHelper, log);
    console.log('🔑 生成签名密钥...');
    await keytool.createSigningKey(
      {
        ...KEYSTORE_CONFIG,
        keypassword: KEYSTORE_CONFIG.password,
      },
      true // overwrite
    );
    console.log('✅ 签名密钥已生成');

    // 4. 生成 TWA 项目
    console.log('📦 生成 TWA 项目文件...');
    const generator = new TwaGenerator();

    const twaManifest = new TwaManifest({
      packageId: 'com.novelforge.app',
      host: 'novel-forge-nu.vercel.app',
      name: 'Novel Forge — AI小说工坊',
      launcherName: 'Novel Forge',
      shortName: 'Novel Forge',
      display: 'standalone',
      themeColor: '#4f46e5',
      themeColorDark: '#3730a3',
      backgroundColor: '#ffffff',
      navigationColor: '#4f46e5',
      navigationColorDark: '#3730a3',
      startUrl: PWA_URL + '/',
      iconUrl: LOCAL_URL + '/icon-512.png',
      maskableIconUrl: LOCAL_URL + '/icon-512.png',
      monochromeIconUrl: LOCAL_URL + '/icon-192.png',
      splashScreenFadeOutDuration: 200,
      appVersionName: '1.0.0',
      appVersionCode: 1,
      fallbackType: 'customtabs',
      features: {
        locationDelegation: { enabled: false },
        playBilling: { enabled: false },
      },
      signingKey: {
        path: KEYSTORE_CONFIG.path,
        alias: KEYSTORE_CONFIG.alias,
      },
      webManifestUrl: LOCAL_URL + '/manifest.json',
      enableNotifications: false,
      isMetaQuest: false,
      orientation: 'default',
    });

    const validationError = twaManifest.validate();
    if (validationError) {
      console.error('❌ TWAManifest 验证失败:', validationError);
      process.exit(1);
    }
    console.log('✅ TWAManifest 验证通过');

    await generator.createTwaProject(BUILD_DIR, twaManifest, log);
    console.log('✅ TWA 项目已生成');

    // 5. 输出说明
    console.log('\n📁 项目文件位置: ' + BUILD_DIR);
    console.log('📱 构建 APK 步骤:');
    console.log('  1. 用 Android Studio 打开 ' + BUILD_DIR);
    console.log('  2. Build → Build Bundle(s) / APK(s) → Build APK(s)');
    console.log('  3. APK 输出: app/build/outputs/apk/release/');
    console.log('\n  或者命令行 (需 Android SDK):');
    console.log('  cd ' + BUILD_DIR);
    console.log('  gradlew assembleRelease');
    console.log('\n✅ 初始化完成！');
  } finally {
    server.close();
  }
}

main().catch(e => {
  console.error('构建失败:', e.message);
  console.error(e.stack);
  process.exit(1);
});
