// Tests for the migration gate in scripts/build.mjs.
//
//   node --test scripts/
//
// The gate's whole job is to answer "is this generated page the same
// page as the committed one". A gate that quietly answers yes when the
// answer is no is worse than no gate, because it is trusted. So each
// rule below is tested in both directions: the difference it is meant
// to ignore, and the difference it must never miss.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonical, describeDiff } from './build.mjs';

const same = (a, b, msg) => assert.equal(canonical(a), canonical(b), msg);
const differs = (a, b, msg) => assert.notEqual(canonical(a), canonical(b), msg);

// --- whitespace -------------------------------------------------

test('indentation is ignored', () => {
  same('<div>\n    <p>Hi</p>\n  </div>', '<div> <p>Hi</p> </div>');
});

test('a space between inline tags is NOT ignored', () => {
  // <span>a</span> <span>b</span> does not render like the version
  // without the space, so collapsing to nothing would hide a real bug.
  differs('<p><span>a</span> <span>b</span></p>', '<p><span>a</span><span>b</span></p>');
});

test('whitespace present vs absent is caught even between blocks', () => {
  // Deliberately strict. Visually these are the same; failing here
  // costs a template tweak, whereas the opposite mistake ships.
  differs('<div><p>Hi</p></div>', '<div>\n<p>Hi</p>\n</div>');
});

test('whitespace inside <pre> is preserved', () => {
  differs('<pre>a\n  b</pre>', '<pre>a b</pre>');
});

// --- attributes -------------------------------------------------

test('attribute order is ignored', () => {
  same('<a href="/x" class="b" id="c">t</a>', '<a id="c" class="b" href="/x">t</a>');
});

test('an attribute value change is caught', () => {
  differs('<link rel="canonical" href="https://a.com/word/">',
          '<link rel="canonical" href="https://a.com/word-game/">');
});

test('a dropped attribute is caught', () => {
  differs('<img src="a.jpg" alt="A cat">', '<img src="a.jpg">');
});

// --- content ----------------------------------------------------

test('a text change is caught', () => {
  differs('<h1>Word Game</h1>', '<h1>Words Game</h1>');
});

test('a dropped element is caught', () => {
  differs('<ul><li>a</li><li>b</li></ul>', '<ul><li>a</li></ul>');
});

test('a changed meta description is caught', () => {
  differs('<meta name="description" content="Play free.">',
          '<meta name="description" content="Play free!">');
});

// --- JSON-LD ----------------------------------------------------

const ld = (body) => `<script type="application/ld+json">${body}</script>`;

test('JSON-LD formatting and key order are ignored', () => {
  same(ld('{"b":1,"a":{"d":4,"c":3}}'), ld('{\n  "a": {\n "c": 3,\n "d": 4\n  },\n  "b": 1\n}'));
});

test('a JSON-LD value change is caught', () => {
  differs(ld('{"name":"Impostor Word Game"}'), ld('{"name":"Impostor Draw Game"}'));
});

test('a dropped JSON-LD entry is caught', () => {
  differs(ld('{"mainEntity":[{"a":1},{"b":2}]}'), ld('{"mainEntity":[{"a":1}]}'));
});

test('array order in JSON-LD is NOT ignored', () => {
  // FAQ answers are an ordered list on the page; reordering them is a
  // real change even though the set is identical.
  differs(ld('{"x":[1,2]}'), ld('{"x":[2,1]}'));
});

test('invalid JSON-LD does not crash, and still differs', () => {
  assert.doesNotThrow(() => canonical(ld('{not json')));
  differs(ld('{not json'), ld('{"a":1}'));
});

test('ordinary script bodies are left alone', () => {
  differs('<script>let a = 1;</script>', '<script>let a=1;</script>');
});

// --- comments ---------------------------------------------------

test('comments are compared by default but droppable', () => {
  const a = '<div><!-- old note --><p>x</p></div>';
  const b = '<div><!-- new note --><p>x</p></div>';
  assert.notEqual(canonical(a), canonical(b), 'default should see the change');
  assert.equal(canonical(a, { dropComments: true }), canonical(b, { dropComments: true }),
    'dropComments should ignore it');
});

test('dropping comments does not hide a real change next to them', () => {
  assert.notEqual(
    canonical('<div><!-- n --><p>x</p></div>', { dropComments: true }),
    canonical('<div><!-- n --><p>y</p></div>', { dropComments: true }));
});

// --- reporting --------------------------------------------------

test('describeDiff points at the first difference', () => {
  const out = describeDiff('<h1>Word Game</h1>', '<h1>Draw Game</h1>');
  assert.match(out, /first difference at character 4/);
  assert.match(out, /committed:/);
  assert.match(out, /generated:/);
});
