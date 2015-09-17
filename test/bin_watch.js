var child = require('child_process');
var http = require('http');
var test = require('tape');
var fs = require('fs');
var path = require('path');
var url = require('url');
var sculpt = require('sculpt');
var temp = require('temp');

var bin = require('../package.json').bin['amok'];

var browsers = [
  'chrome',
  'chromium',
];

browsers.forEach(function (browser) {
  temp.track();
  var dirname = temp.mkdirSync();
  fs.writeFileSync(
    path.join(dirname, 'index.html'),
    fs.readFileSync(path.resolve('test/fixture/watch-events/index.html'), 'utf-8')
  );

  fs.writeFileSync(
    path.join(dirname, 'index.js'),
    fs.readFileSync(path.resolve('test/fixture/watch-events/index.js'), 'utf-8')
  );

  var args = [
    bin,
    '--cwd',
    dirname,
    '--watch',
    '*.txt',
    '--browser',
    browser,
    url.resolve('file://', path.join('/' + dirname, 'index.html'))
  ];

  test(args.join(' '), function (test) {
    test.plan(5);

    var ps = child.spawn('node', args);
    ps.stderr.pipe(process.stderr);
    ps.on('close', function () {
      test.pass('close');
    });

    var messages = [
      'ready',
      'add file.txt',
      'change file.txt',
      'unlink file.txt'
    ];

    ps.stdout.setEncoding('utf-8');
    ps.stdout.pipe(sculpt.split(/\r?\n/)).on('data', function (line) {
      if (line.length === 0) {
        return;
      }

      test.equal(line, messages.shift(), line);

      if (line === 'ready') {
        fs.writeFileSync(path.join(dirname, 'file.txt'), 'hello', 'utf-8');
      } else if (line === 'add file.txt') {
        fs.writeFileSync(path.join(dirname, 'file.txt'), 'hello world', 'utf-8');
      } else if (line === 'change file.txt') {
        fs.unlinkSync(path.join(dirname, 'file.txt'));
      }

      if (messages.length === 0) {
        ps.kill();
      }
    });
  });
});
