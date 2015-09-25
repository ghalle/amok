var util = require('util');
var fs = require('fs');
var url = require('url');
var path = require('path');

var debug = util.debuglog('amok-hotpatch');

function plugin() {
  return function hotpatch(client, runner, done) {
    var cwd = runner.get('cwd');
    if (cwd) {
      cwd = path.resolve(cwd);
    } else {
      cwd = process.cwd();
    }

    var scripts = {};
    var watchers = {};

    client.on('close', function () {
      debug('close');
      scripts = {};

      Object.keys(watchers).forEach(function (key) {
        watchers[key].close();
      });

      watchers = {};
    });

    client.on('connect', function () {
      debug('connect');

      client.debugger.on('clear', function () {
        debug('clear');
        scripts = {};

        Object.keys(watchers).forEach(function (key) {
          watchers[key].close();
        });

        watchers = {};
      });

      client.debugger.on('scriptParse', function (script) {
        debug('parse %s', util.inspect(script));

        var uri = url.parse(script.url);
        var filename = null;
        var sources = runner.get('scripts') || {};

        if (uri.protocol === 'file:') {
          filename = path.normalize(uri.pathname);
          if (filename.match(/^\\[a-zA-Z]:\\/)) {
            filename = filename.slice(1);
          }
        } else if (uri.protocol === 'http:') {
          filename = uri.pathname.slice(1);
          if (sources[path.normalize(filename)]) {
            filename = path.resolve(sources[path.normalize(filename)]);
          } else {
            filename = path.resolve(cwd, filename);
          }
        }

        if (!filename) {
          return;
        }

        scripts[filename] = script;

        var dirname = path.dirname(filename);
        if (watchers[dirname]) {
          return;
        }

        debug('watch directory %s', dirname);
        var watcher = fs.watch(dirname);
        watchers[dirname] = watcher;

        var streams = {};
        watcher.on('change', function (event, filename) {
          if (!filename) {
            return;
          }

          filename = path.resolve(dirname, filename);

          var script = scripts[filename];
          if (!script) {
            return;
          }

          debug(event, filename);
          if (streams[filename]) {
            return;
          }

          var source = '';
          var stream = fs.createReadStream(filename);
          streams[filename] = stream;

          stream.setEncoding('utf-8');
          stream.on('data', function(chunk) {
            source += chunk;
          });

          stream.on('end', function() {
            streams[filename] = null;

            if (source.length === 0) {
              return;
            }

            debug('patch script %s (%d bytes) ', script.url, source.length);
            client.debugger.setScriptSource(script, source, function (error, result) {
              if (error) {
                debug('set source error %s', util.inspect(error));
                return client.emit('error', error);
              }

              var detail = JSON.stringify({
                detail: {
                  filename: path.relative(cwd, filename),
                  source: source,
                }
              });

              var cmd = 'var event = new CustomEvent(\'patch\',' +
              detail + ');\nwindow.dispatchEvent(event);';

              debug('evaluate patch event');
              client.runtime.evaluate(cmd, function (error) {
                if (error) {
                  debug('evaluate error %s', util.inspect(error));
                  return client.emit('error', error);
                }
              });
            });
          });
        });
      });

      client.debugger.enable(function (error) {
        if (error) {
          return client.emit('error', error);
        }

        debug('debugger');
      });

      client.runtime.enable(function (error) {
        if (error) {
          return client.emit('error', error);
        }

        debug('runtime');
      });
    });

    debug('done');
    done();
  };
}

module.exports = plugin;
