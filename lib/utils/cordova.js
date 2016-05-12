'use strict';

var Q = require('q');
var _ = require('underscore');
var path = require('path');
var colors = require('colors');
var fs = require('fs');
var IonicAppLib = require('ionic-app-lib');
var Serve = IonicAppLib.serve;
var Project = IonicAppLib.project;
var log = IonicAppLib.logging.logger;
var ConfigXml = IonicAppLib.configXml;
var exec = require('child_process').exec;
var promiseExec = Q.denodeify(exec);

/**
 * Returns true or false after checking if cordova is installed
 *
 * @return {Boolean} True if cordova is installed
 */
function isCordovaInstalled() {
  var result = exec('cordova -v', { silent: true });
  return (result.code !== 0);
}

/**
 * Returns true or false after checking if the platform exists
 * Synchronous
 *
 * @param {String} platform The platform to check for
 * @param {String} baseDir The projects base directory
 * @return {Boolean} True if platform is installed
 */
function isPlatformInstalled(platform, baseDir) {
  platform = platform || 'ios';

  var platformPath = path.join(baseDir, 'platforms', platform);

  try {
    fs.statSync(platformPath);
    return true;
  } catch (ex) {
    return false;
  }
}

/**
 * Returns true or false after checking if any plugin is installed
 * Synchronous
 *
 * @param {String} baseDir The projects base directory
 * @return {Boolean} True if any plugin is installed
 */
function arePluginsInstalled(baseDir) {
  var pluginPath = path.join(baseDir, 'plugins');

  try {
    fs.statSync(pluginPath);
    return true;
  } catch (ex) {
    return false;
  }
}

/**
 * Install the platform specified using cordova
 *
 * @param {String} platform The platform to install (ios, android, etc.)
 * @return {Promise} Promise upon completion
 */
function installPlatform(platform) {
  log.info(colors.yellow('• You\'re trying to build for ' + platform + 'but don\'t have the platform installed yet.'));
  log.info('∆ Installing ' + platform + ' for you.');

  return promiseExec('cordova platform add ' + platform).then(function() {
    log.info('√ Installed platform ' + platform);
  });
}

/**
 * Install ionic required plugins
 *
 * @return {Promise} Promise upon completion
 */
function installPlugins() {
  var plugins = [
    'cordova-plugin-device',
    'cordova-plugin-console',
    'cordova-plugin-whitelist',
    'cordova-plugin-splashscreen',
    'cordova-plugin-statusbar',
    'ionic-plugin-keyboard'
  ];

  return Q.all(plugins.map(function(plugin) {
    log.info(['Installing ', plugin].join(''));
    return promiseExec('cordova plugin add --save' + plugin);
  }));
}

/**
 * Filter and gather arguments from command line to be passed to Cordova
 *
 * @param {String} cmdName The command that is being executed (ie run, build, etc)
 * @param {Object} argv An optimist object
 * @return {Array} Returns a list of commands to use with cordova
 */
function filterArgumentsForCordova(cmdName, argv) {

  // clean out any cmds that may confuse cordova
  var port = argv.port || argv.p || '';
  var liveReloadPort = argv.livereloadport || argv['livereload-port'] || argv.r || '';
  var ignoreCmds = [
    '--livereload', '-l',
    '--consolelogs', '-c',
    '--serverlogs', '-s',
    '--port', '-p',
    '--livereload-port',
    '-i', '-r'
  ];

  var cmdArgs = (process.argv.length > 3 ? process.argv.slice(3) : []);
  cmdArgs.unshift(cmdName);

  return cmdArgs.filter(function(arg, index, fullList) {

    // Remove address parameter and the param that follows it
    if (arg === '--address' || fullList[index - 1] === '--address') { return false; }

    // If arg is equal to what we identifed as the port accept it
    if (port && arg === port) { return true; }

    // If arg is equal to what we identifed as the liveReloadPort accept it
    if (liveReloadPort && arg === liveReloadPort) { return true; }

    return ignoreCmds.indexOf(arg) !== -1;
  }).map(function(arg) {

    // If the arg is the target command and it does not contain double quotes add them
    // process.argv removes them
    if (arg.indexOf('--target=') === 0 && arg.indexOf('"') === -1) {
      return arg.replace('--target=', '--target="') + '"';
    }
    return arg;
  });
}

/**
 * Setup the live reload server for ionic
 *
 * @param {Array} argv List of arguments
 * @param {String} baseDir The projects base directory
 * @return {Promise} Promise upon completion
 */
function setupLiveReload(argv, baseDir) {
  log.info(colors.green.bold('Setup Live Reload'));

  var project = Project.load(baseDir);
  var options = _.extend(Serve.loadSettings(argv, project), {
    appDirectory: baseDir,
    runLivereload: true,
    launchBrowser: false,
    launchLab: false,
    isPlatformServe: true
  });


  // First ask user for the IP selection
  // Check ports not used
  // Set up config.xml src url
  // run the cordova command

  var promises = [];

  if (argv.all) {
    log.info('Defaulting address to 0.0.0.0');
    options.address = '0.0.0.0';
  } else if (argv.address) {
    options.address = argv.address;
  } else {
    promises = promises.concat(Serve.getAddress(options));
  }

  return Q.all(promises)
  .then(function() {
    options.devServer = Serve.host(options.address, options.port);
    return Serve.checkPorts(true, options.port, options.address, options);
  })
  .then(function() {
    if (options.runLivereload) {
      return Serve.checkPorts(false, options.liveReloadPort, options.address, options);
    }
  })
  .then(function() {
    return ConfigXml.setConfigXml(process.cwd(), {
      devServer: Serve.host(options.address, options.port)
    });
  })
  .then(function() {
    return Serve.start(options);
  })
  .then(function() {
    Serve.showFinishedServeMessage(options);
    return options;
  })
  .catch(function(error) {
    log.info('There was an error serving your Ionic application for run', error);
    log.info(error.stack);
    throw error;
  });
}

module.exports = {
  isCordovaInstalled: isCordovaInstalled,
  isPlatformInstalled: isPlatformInstalled,
  arePluginsInstalled: arePluginsInstalled,
  installPlatform: installPlatform,
  installPlugins: installPlugins,
  filterArgumentsForCordova: filterArgumentsForCordova,
  setupLiveReload: setupLiveReload
};