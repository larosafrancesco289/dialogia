import test from 'node:test';
import assert from 'node:assert/strict';
import { titleForSource } from './citations';

test("a source's title drops the site name its host already gives", () => {
  const nobel = 'https://www.nobelprize.org/prizes/physics/';
  assert.equal(
    titleForSource({ title: 'Nobel Prize in Physics - NobelPrize.org', url: nobel }),
    'Nobel Prize in Physics',
  );
  assert.equal(
    titleForSource({ title: 'Rates rise again | BBC News', url: 'https://www.bbc.co.uk/news/1' }),
    'Rates rise again',
  );
  // A dash that is part of the title, or a site the host does not name, stays.
  assert.equal(
    titleForSource({ title: 'Pre-war maps - an archive', url: nobel }),
    'Pre-war maps - an archive',
  );
  assert.equal(titleForSource({ url: nobel }), 'nobelprize.org');
});
