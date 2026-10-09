var test = require('tape');
var expand = require('..');

// https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-3jxr-9vmj-r5cp
test('unbound recursion', function (t) {
  var n = 5000
  var parts = []
  for (var i = 0; i < n; i++) parts.push('{}')
  var str = parts.join(',')
  var startTime = Date.now()
  var expanded = expand(str)
  var endTime = Date.now()
  var duration = endTime - startTime
  t.deepEqual(expanded, [str], 'does not expand')
  t.ok(duration < 5000, 'expected expansion to be less than 5000ms: ' + duration + 'ms')
  t.end()
})
