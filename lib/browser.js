var web = require('browser_process');
var util = require('util');
var rdbg = require('rdbg');
var temp = require('temp');
var net = require('net');

var debug = util.debuglog('amok-browser');

function plugin(port, command, args, options) {
  if (typeof args === 'undefined') {
    args = [];
  } else {
    args = args.slice(0);
  }

  return function browser(client, runner, done) {
    var server = net.createServer();

    server.once('error', function(error) {
      debug('server error', error);
      done(error);
    });

    server.once('listening', function() {
      debug('server listening');

      server.once('close', function() {
        debug('server close');

        var url = runner.get('url');

        // TODO, move into browser_process.createProfile, deleting the first run file
        // should be equivilent of providing these options, and be compatible with how firefox does it.
        args.unshift('--no-first-run', '--no-default-browser-check');
        var dirname = temp.path(command);
        args.unshift.apply(args, web.options(command, {
          profile: dirname,
          url: url,
          debug: port,
        }));

        debug('spawn %s %s', command, args.join(' '));
        web.spawn(command, args, options, function (error, browser) {
          if (error) {
            debug('bail %s', error.description);
            return done(error);
          }

          runner.once('close', function kill() {
            debug('kill process');
            browser.kill('SIGTERM');
          });

          debug('find %s', url);
          setTimeout(function find(retry) {
            rdbg.get(port, 'localhost', function (error, targets) {
              if (error) {
                targets = [];
              }

              var matches = targets.filter(function (target) {
                return url === target.url;
              });

              if (matches.length > 0) {
                debug('ready');
                return done();
              } else if (retry) {
                return setTimeout(find, 1000, --retry);
              }

              if (error === undefined) {
                error = new Error('Cannot find browser tab \'' + url + '\'');
              }

              debug('find error', error);
              done(error);
            });
          }, 1000, 120);
        });
      });

      debug('close server');
      server.close();
    });

    debug('starting server on port', port);
    server.listen(port);
  };
}

module.exports = plugin;
