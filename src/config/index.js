const { ipcMain, app, shell } = require('electron');

ipcMain.on('DISCORD_UPDATED_QUOTES', (e, c) => {
  if (c === 'o') exports.open();
});

exports.open = () => {
  const win = require('../utils/win')({
    width: 600,
    height: 650
  }, 'config');

  let config = settings.get('openasar', {});
  config.setup = true;
  settings.set('openasar', config);
  settings.save();

  ipcMain.on('NUCLEUS_EDIT', () => {
    settings.set('openasar', config);
    settings.save();
    shell.openPath(require('../paths').getUserData() + '/settings.json');
  });

  ipcMain.on('cs', (e, c) => {
    config = c;
    settings.set('openasar', config);
    settings.save(); // Ensure saving
  });

  ipcMain.on('cg', e => {
    e.returnValue = config;
  });

  ipcMain.on('cr', () => {
    settings.save();
    app.relaunch();
    app.exit();
  });

  ipcMain.on('of', () => {
    shell.openPath(require('../paths').getUserData() + '/settings.json')
  })
};
