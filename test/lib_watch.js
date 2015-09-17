var amok = require('..');
var fs = require('fs');
var test = require('tape');
var url = require('url');
var path = require('path');
var temp = require('temp');

var browsers = [
  'chrome',
  'chromium',
];

browsers.forEach(function (browser, index) {
  var port = 4000 + index;

  temp.track();
  var dirname = temp.mkdirSync();
  fs.writeFileSync(
    path.join(dirname, 'index.html'),
    fs.readFileSync('test/fixture/watch-events/index.html', 'utf-8')
  );

  fs.writeFileSync(
    path.join(dirname, 'index.js'),
    fs.readFileSync('test/fixture/watch-events/index.js', 'utf-8')
  );

  test('watch events in ' + browser, function (test) {
    test.plan(7);

    var runner = amok.createRunner();
    runner.on('close', function () {
      test.pass('close');
    });

    runner.set('url', url.resolve('file://', path.join('/' + dirname, 'index.html')));

    runner.set('cwd', 'test/fixture/watch-events');
    runner.use(amok.browser(port, browser));
    runner.use(amok.watch('*.txt'));

    runner.connect(port, 'localhost', function () {
      test.pass('connect');

      var values = [
        'ready',
        'add file.txt',
        'change file.txt',
        'unlink file.txt'
      ];

      runner.client.console.on('data', function (message) {
        test.equal(message.text, values.shift(), message.text);

        if (values[0] === undefined) {
          runner.close();
        } if (message.text === 'ready') {
          fs.writeFileSync('test/fixture/watch-events/file.txt', 'hello', 'utf-8');
        } else if (message.text === 'add file.txt') {
          fs.writeFileSync('test/fixture/watch-events/file.txt', 'hello world', 'utf-8');
        } else if (message.text === 'change file.txt') {
          fs.unlinkSync('test/fixture/watch-events/file.txt');
        }
      });

      runner.client.console.enable(function (error) {
        test.error(error);
      });
    });
  });
});
