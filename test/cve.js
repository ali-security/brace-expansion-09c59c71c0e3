var test = require('tape');
var expand = require('..');

// CVE-2026-14257: `max` caps the number of results but not their length, so
// chaining many brace groups keeps the count under `max` while each result
// grows with the number of groups. Building 100k long results (and the
// intermediate arrays combined along the way) exhausted memory and crashed
// the process with an uncatchable out-of-memory error.
test('total expansion length is bounded', function(t) {
  var str = new Array(1501).join('{a,b}')
  var startTime = Date.now()
  var expanded = expand(str)
  var endTime = Date.now()

  var totalLength = expanded.reduce(function (sum, s) { return sum + s.length; }, 0)
  t.ok(
    totalLength <= 4000000,
    'Expected total length (' + totalLength + ') to be bounded'
  )
  t.ok(expanded.length > 0, 'still returns a (truncated) result')
  t.ok(
    expanded.every(function (s) { return /^[ab]+$/.test(s); }),
    'results are valid expansions'
  )
  t.ok(
    endTime - startTime < 5000,
    'Expected time (' + (endTime - startTime) + 'ms) to be less than 5000ms'
  )

  // The bound is a single accumulator, not a per-level limit, so it holds no
  // matter how many brace groups are chained - not `groups * maxLength`.
  var groupsList = [100, 1500, 5000]
  for (var i = 0; i < groupsList.length; i++) {
    var total = expand(new Array(groupsList[i] + 1).join('{a,b}')).reduce(
      function (sum, s) { return sum + s.length; },
      0
    )
    t.ok(
      total <= 4000000,
      'Expected total length (' + total + ') to stay bounded at ' + groupsList[i] + ' groups'
    )
  }

  t.end();
})

// Expanding the tail iteratively (rather than recursing once per brace group)
// keeps native stack depth constant, so deeply chained input that used to throw
// `RangeError: Maximum call stack size exceeded` now returns a bounded result.
test('deep chaining does not overflow the stack', function(t) {
  var str = new Array(50001).join('{a,b}')
  t.doesNotThrow(function () {
    var expanded = expand(str)
    t.ok(expanded.length > 0, 'still returns a (truncated) result')
    t.ok(
      expanded.reduce(function (sum, s) { return sum + s.length; }, 0) <= 4000000,
      'output stays bounded'
    )
  })

  t.end();
})

test('maxLength option bounds output size', function (t) {
  var str = new Array(1501).join('{a,b}')
  var expanded = expand(str, { maxLength: 100000 })
  var totalLength = expanded.reduce(function (sum, s) { return sum + s.length; }, 0)
  t.ok(
    totalLength <= 100000,
    'Expected total length (' + totalLength + ') to respect maxLength'
  )

  // The `${...}` branch returns the whole remainder as a single literal, which
  // must be bounded the same way.
  var dollar = '${x}' + new Array(21).join('{a,b}')
  t.deepEqual(expand(dollar), [dollar], 'literal fits under the default maxLength')
  t.deepEqual(
    expand(dollar, { maxLength: 10 }),
    [],
    'literal longer than maxLength is dropped'
  )

  t.end();
})
