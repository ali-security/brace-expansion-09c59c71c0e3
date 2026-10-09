var test = require('tape');
var expand = require('..');

// Bypass of CVE-2026-14257's mitigation: each comma-separated alternative
// (`{alt,alt,...}`) is expanded independently, and `maxLength` only bounded
// each alternative's own output, not the running total accumulated across
// all of them. Many alternatives - each individually far under `maxLength` -
// could still sum to an unbounded intermediate array before the final
// `combine` call ever got a chance to truncate.
test('total length across comma alternatives is bounded', function (t) {
  var alt = '{1..5}'
  var alts = []
  for (var i = 0; i < 1000; i++) alts.push(alt)
  var str = '{' + alts.join(',') + '}'
  var startTime = Date.now()
  var expanded = expand(str, { maxLength: 50 })
  var endTime = Date.now()

  var totalLength = expanded.reduce(function (sum, s) {
    return sum + s.length
  }, 0)
  t.ok(
    totalLength <= 50,
    'Expected total length (' + totalLength + ') to respect maxLength'
  )
  t.ok(expanded.length > 0, 'still returns a (truncated) result')
  t.ok(
    endTime - startTime < 500,
    'Expected time (' + (endTime - startTime) + 'ms) to be less than 500ms'
  )

  // Regression case from the report: 400 alternatives, each individually
  // bounded by maxLength but unbounded in aggregate before the fix.
  var part = '{' + new Array(50 + 1).join('0') + '1..100000}'
  var parts = []
  for (var j = 0; j < 400; j++) parts.push(part)
  var bigStr = '{' + parts.join(',') + '}'
  t.doesNotThrow(function () {
    var bigExpanded = expand(bigStr)
    var bigTotal = bigExpanded.reduce(function (sum, s) {
      return sum + s.length
    }, 0)
    t.ok(
      bigTotal <= 4000000,
      'Expected total length (' + bigTotal + ') to stay bounded'
    )
  })

  t.end();
})

// A padded sequence's element width follows the input, so generating all `max`
// elements before `combine` could discard them cost time proportional to
// `max * width` - a ~400KB input blocked the event loop for over two minutes.
test('padded sequences respect maxLength while generating', function (t) {
  var str = '{' + new Array(400000 + 1).join('0') + '1..100000}'
  var startTime = Date.now()
  var expanded = expand(str)
  var elapsed = Date.now() - startTime

  var totalLength = expanded.reduce(function (sum, s) {
    return sum + s.length
  }, 0)
  t.ok(
    totalLength <= 4000000,
    'Expected total length (' + totalLength + ') to stay bounded'
  )
  t.ok(expanded.length > 0, 'still returns a (truncated) result')
  // The bound is looser than upstream's 2000ms to leave headroom for the
  // legacy (node 0.12) test legs; an unbounded run takes minutes.
  t.ok(
    elapsed < 5000,
    'Expected time (' + elapsed + 'ms) to be less than 5000ms'
  )

  // Truncating early must not change results that fit within the bound.
  t.deepEqual(
    expand('{01..10}'),
    ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'],
    'padded sequences under the bound are unaffected'
  )

  t.end();
})

// Bounding the intermediate `values` array must not change what `max` counts:
// alternatives that expand to nothing are dropped by `combine`, so they cost a
// slot in `values` but never a result.
test('max bounds the number of kept results', function (t) {
  t.deepEqual(
    expand('{a,,b}', { max: 2 }),
    ['a', 'b'],
    'dropped empty alternatives do not count against max'
  )
  t.deepEqual(
    expand('{a,,,b,c}', { max: 3 }),
    ['a', 'b', 'c'],
    'consecutive empty alternatives do not count against max'
  )
  // Here the empties survive as `xy`, so they are results and do count.
  t.deepEqual(
    expand('x{a,,b}y', { max: 2 }),
    ['xay', 'xy'],
    'kept empty alternatives still count against max'
  )

  // The `{a},b}` rewrite starts a fresh empty-drop run part-way through the
  // string, so `acc` already holds non-empty prefixes (`x`, `y`) that predate
  // it. The empties in the rewritten set add nothing past that baseline and
  // are dropped by `combine`, so they must not use up `max` slots either:
  // the pre-scan has to compare against the baseline, not test `acc` for
  // emptiness.
  t.deepEqual(
    expand('{x,y}{a},,,b}'),
    ['xa}', 'xb', 'ya}', 'yb'],
    'empties in a rewritten {a},b} set are dropped'
  )
  t.deepEqual(
    expand('{x,y}{a},,,b}', { max: 3 }),
    ['xa}', 'xb', 'ya}'],
    'empties after a {a},b} rewrite do not count against max (baseline-aware drop)'
  )

  t.end();
})
