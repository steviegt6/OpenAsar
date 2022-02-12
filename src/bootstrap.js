const { app, BrowserWindow } = require('electron');
const { readFileSync } = require('fs');
const { join } = require('path');

const Constants = require('./Constants');

switch (process.platform) { // Discord forces these
  case 'linux':
    process.env.PULSE_LATENCY_MSEC = process.env.PULSE_LATENCY_MSEC ?? 30;

    break;
  case 'win32':
    app.setAppUserModelId(Constants.APP_ID);

    break;
}

app.name = 'discord'; // Force name as sometimes breaks

const paths = require('./paths');
global.moduleDataPath = paths.getModuleDataPath(); // Global because discord
app.setPath('userData', paths.getUserData()); // Set userData properly because electron

const buildInfo = require('./utils/buildInfo');
app.setVersion(buildInfo.version); // More global because discord / electron
global.releaseChannel = buildInfo.releaseChannel;

log('BuildInfo', 'Loaded build info', buildInfo);

const errorHandler = require('./errorHandler');
errorHandler.init();

// Just required for startup
const appSettings = require('./appSettings');
const GPUSettings = require('./GPUSettings');
const crashReporterSetup = require('./crashReporterSetup');
const splashScreen = require('./splash');
const autoStart = require('./autoStart');

const updater = require('./updater/updater');
const moduleUpdater = require('./updater/moduleUpdater');
const appUpdater = require('./updater/appUpdater');

const settings = appSettings.getSettings();
if (!settings.get('enableHardwareAcceleration', true)) app.disableHardwareAcceleration();

let desktopCore;
const startCore = () => {
  desktopCore = require('discord_desktop_core');
  log('Bootstrap', 'Required desktop_core:', desktopCore);

  desktopCore.startup({
    paths,
    splashScreen,
    moduleUpdater,
    autoStart,
    buildInfo,
    appSettings,
    Constants,
    GPUSettings,
    updater,
    crashReporterSetup,
  });

  const i = setImmediate(() => {
    log('MainWindowInject', 'Attempting to get main window');

    if (!global.mainWindowId) return;

    log('MainWindowInject', 'Success, adding dom-ready handler');

    clearInterval(i);

    const bw = BrowserWindow.fromId(global.mainWindowId);

    let donePageReady = false;
    bw.webContents.on('dom-ready', () => {
      if (!donePageReady) { // Only run once
        splashScreen.pageReady(); // Override Core's pageReady with our own on dom-ready to show main window earlier
        donePageReady = true;
      }

      log('MainWindowInject', 'dom-ready triggered, injecting JS');

      const cmdSwitches = require('./cmdSwitches');

      let injectJs = readFileSync(join(__dirname, 'mainWindowInject.js'), 'utf8');

      const [ version1, version2 ] = oaVersion.split('-'); // Split via -
      injectJs = injectJs
        .replaceAll('<oa_version_channel>', version1[0].toUpperCase() + version1.substring(1).toLowerCase())
        .replaceAll('<oa_version_hash>', version2 || 'custom')
        .replaceAll('<oa_cmd_preset>', cmdSwitches.preset)
        .replaceAll('<oa_cmd_full>', cmdSwitches.cmd);

      bw.webContents.executeJavaScript(injectJs);
    });
  });
};

const startUpdate = () => {
  const startMinimized = process.argv.includes('--start-minimized');

  paths.cleanOldVersions();

  appUpdater.update(startMinimized, () => {
    if (process.env.OPENASAR_NOSTART) return;

    startCore();
  }, () => {
    log('Bootstrap', 'Setting main window visible');
    desktopCore.setMainWindowVisible(!startMinimized);

    setTimeout(() => { // Try to update our asar
      if (oaConfig.autoupdate === false) return; // If autoupdate disabled, don't update

      const asarUpdate = require('./asarUpdate');

      try {
        asarUpdate();
      } catch (e) {
        log('AsarUpdate', 'Failed', e);
      }
    }, 1000);
  });
};


module.exports = () => {
  if (!app.requestSingleInstanceLock() && !(process.argv.includes('--multi-instance') || oaConfig.multiInstance === true)) {
    log('Bootstrap', 'Non-first instance');
    return app.quit();
  }

  if (app.isReady()) {
    startUpdate();
  } else {
    app.once('ready', startUpdate);
  }
};